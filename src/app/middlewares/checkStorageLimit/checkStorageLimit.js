import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import SubscriptionModel from '../../modules/payment/payment.model.js';
import UserUsageModel from '../../modules/usage/userUsage.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Plan storage limits (bytes) — used as fallback for free / no-subscription users.
 * Free plan = 0 bytes → all uploads blocked.
 */
const FREE_PLAN_STORAGE_LIMIT_BYTES = 0;

/** Bytes per GB (for human-readable messages) */
const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Format a byte count into a human-readable string (e.g. "10 GB", "512 MB").
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 GB';
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(bytes % BYTES_PER_GB === 0 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb % 1 === 0 ? 0 : 1)} MB`;
}

/**
 * Collect all files from the request (multer single, array, or fields).
 * Returns an array of objects with at minimum a `size` property.
 * @param {import('express').Request} req
 * @returns {{ size: number, originalname: string }[]}
 */
function getRequestFiles(req) {
  if (req.file) return [req.file];

  if (req.files) {
    if (Array.isArray(req.files)) return req.files;
    // multer fields → { fieldname: [files] }
    return Object.values(req.files).flat();
  }

  return [];
}

/**
 * Determine the total incoming byte size for this request.
 *
 * Priority order:
 *  1. `req.fileSize` — explicitly set by the route handler or a prior middleware
 *  2. Sum of all multer file sizes (`req.file` / `req.files`)
 *  3. `content-length` header as a last-resort estimate (may include form overhead)
 *  4. 0 if none of the above are available
 *
 * @param {import('express').Request} req
 * @returns {number} bytes
 */
function getIncomingSize(req) {
  // 1. Explicit override from route / prior middleware
  if (typeof req.fileSize === 'number' && req.fileSize >= 0) {
    return req.fileSize;
  }

  // 2. Sum multer files
  const files = getRequestFiles(req);
  if (files.length > 0) {
    return files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  }

  // 3. Content-Length header (rough estimate)
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (!isNaN(contentLength) && contentLength > 0) {
    return contentLength;
  }

  return 0;
}

/**
 * Build a plan-specific upgrade hint for storage-exceeded errors.
 * @param {string} planName
 * @param {number} storageLimit        - bytes
 * @param {number} storageUsed         - bytes
 * @param {number} incomingSize        - bytes
 * @returns {string}
 */
function buildUpgradeHint(planName, storageLimit, storageUsed, incomingSize) {
  const usedFmt = formatBytes(storageUsed);
  const limitFmt = formatBytes(storageLimit);
  const incomingFmt = formatBytes(incomingSize);

  const base =
    `Storage limit exceeded. You have used ${usedFmt} of ${limitFmt} ` +
    `and the incoming file (${incomingFmt}) would exceed your limit.`;

  if (planName === 'free' || storageLimit === 0) {
    return (
      `${base} File storage is not included in the Free plan. ` +
      'Upgrade to Explore ($20/mo) for 10 GB, Execute ($50/mo) for 50 GB, ' +
      'or Command ($100/mo) for 100 GB of storage.'
    );
  }

  if (planName === 'explore') {
    return (
      `${base} Your Explore plan includes 10 GB. ` +
      'Upgrade to Execute ($50/mo) for 50 GB or Command ($100/mo) for 100 GB.'
    );
  }

  if (planName === 'execute') {
    return (
      `${base} Your Execute plan includes 50 GB. ` +
      'Upgrade to Command ($100/mo) for 100 GB of storage.'
    );
  }

  // command or unknown
  return `${base} You have reached the maximum storage limit for your plan (${limitFmt}).`;
}

/**
 * Middleware to enforce per-user storage limits based on the active subscription.
 *
 * Attach to any route that accepts file uploads (knowledge bank, document upload, image upload).
 *
 * Behaviour:
 *  - Free plan (storagePerUser = 0 bytes) → all uploads blocked (413)
 *  - Paid plans → checks storageUsed + incomingSize against subscription.limits.storagePerUser
 *  - Passes `req.incomingFileSize` (bytes) downstream so upload controllers can call
 *    `UserUsageModel.updateStorage()` after a successful save without re-computing the size.
 *
 * Note: This middleware does NOT update storage — that is done in the upload controller
 * after the file is actually persisted (Task 5).
 */
const checkStorageLimit = async (req, res, next) => {
  try {
    // Skip for guests / unauthenticated requests
    if (req.isGuest || !req.user || !req.user.id) {
      return next();
    }

    const userId = req.user.id;
    const tenantId = req.currentTenantId ?? null;

    // ── 1. Get the active subscription for the right context ──────────────────
    const subscription = await SubscriptionModel.findOne(
      tenantId
        ? { tenantId, paymentStatus: 'paid' }
        : { userId, tenantId: null, paymentStatus: 'paid' }
    );

    const storageLimit =
      subscription?.limits?.storagePerUser ?? FREE_PLAN_STORAGE_LIMIT_BYTES;
    const planName = subscription?.plan_name ?? 'free';

    // ── 2. Free plan — no storage at all ─────────────────────────────────────
    if (storageLimit === 0) {
      logger.warn(
        `Storage upload blocked — user: ${userId}, plan: ${planName} (storagePerUser: 0 bytes)`
      );

      throw new ApiError(
        httpStatus.PAYLOAD_TOO_LARGE,
        buildUpgradeHint(planName, 0, 0, getIncomingSize(req))
      );
    }

    // ── 3. Get current cumulative storage for this user context ───────────────
    const storageUsed = await UserUsageModel.getTotalStorage(userId, tenantId);

    // ── 4. Determine how large the incoming payload is ────────────────────────
    const incomingSize = getIncomingSize(req);

    logger.info(
      `Storage check — user: ${userId}, plan: ${planName}, ` +
        `used: ${formatBytes(storageUsed)}, incoming: ${formatBytes(incomingSize)}, ` +
        `limit: ${formatBytes(storageLimit)}`
    );

    // ── 5. Enforce limit ──────────────────────────────────────────────────────
    if (storageUsed + incomingSize > storageLimit) {
      logger.warn(
        `Storage limit exceeded — user: ${userId}, plan: ${planName}, ` +
          `used: ${formatBytes(storageUsed)}, incoming: ${formatBytes(incomingSize)}, ` +
          `limit: ${formatBytes(storageLimit)}`
      );

      throw new ApiError(
        httpStatus.PAYLOAD_TOO_LARGE,
        buildUpgradeHint(planName, storageLimit, storageUsed, incomingSize)
      );
    }

    // ── 6. Pass computed values downstream ────────────────────────────────────
    // Upload controllers use req.incomingFileSize to call UserUsageModel.updateStorage()
    // after the file is persisted (Task 5).
    req.incomingFileSize = incomingSize;
    req.storageUsed = storageUsed;
    req.storageLimit = storageLimit;

    // Set informational headers (useful for clients / debugging)
    res.setHeader('X-Storage-Used-Bytes', storageUsed);
    res.setHeader('X-Storage-Limit-Bytes', storageLimit);
    res.setHeader(
      'X-Storage-Remaining-Bytes',
      Math.max(0, storageLimit - storageUsed)
    );

    next();
  } catch (error) {
    next(error);
  }
};

export default checkStorageLimit;
