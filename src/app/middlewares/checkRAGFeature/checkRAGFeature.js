import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import SubscriptionModel from '../../modules/payment/payment.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * RAG feature tiers and what file types each allows.
 *
 *  none              → Free plan. RAG endpoints are blocked entirely.
 *  basic_text        → Explore. Text/document files only. No images, audio, or video.
 *  advanced_multimodal → Execute. Documents + images. No audio or video.
 *  premium_agentic   → Command. All file types allowed.
 */

// MIME type category maps
const MIME_CATEGORIES = {
  document: [
    'text/plain',
    'text/csv',
    'text/html',
    'text/xml',
    'text/markdown',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.oasis.opendocument.text', // .odt
    'application/vnd.oasis.opendocument.spreadsheet', // .ods
    'application/json',
    'application/xml',
    'application/rtf',
  ],
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
    'image/avif',
  ],
  audio: [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/aac',
    'audio/mp4',
    'audio/webm',
  ],
  video: [
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
  ],
};

/** Allowed MIME categories per RAG tier */
const ALLOWED_CATEGORIES = {
  none: [],
  basic_text: ['document'],
  advanced_multimodal: ['document', 'image'],
  premium_agentic: ['document', 'image', 'audio', 'video'],
};

/**
 * Determine which MIME category a given MIME type belongs to.
 * Returns null if unrecognised.
 * @param {string} mimeType
 * @returns {'document'|'image'|'audio'|'video'|null}
 */
function getMimeCategory(mimeType) {
  if (!mimeType) return null;
  const normalized = mimeType.split(';')[0].trim().toLowerCase();

  for (const [category, mimes] of Object.entries(MIME_CATEGORIES)) {
    if (mimes.includes(normalized)) return category;
  }

  // Broad prefix fallback for wildcard text/* etc.
  if (normalized.startsWith('text/')) return 'document';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';

  return null;
}

/**
 * Collect all files from the request (multer single, array, or fields).
 * @param {import('express').Request} req
 * @returns {{ fieldname: string, originalname: string, mimetype: string }[]}
 */
function getRequestFiles(req) {
  if (req.file) return [req.file];

  if (req.files) {
    // multer array → plain array
    if (Array.isArray(req.files)) return req.files;
    // multer fields → { fieldname: [files] }
    return Object.values(req.files).flat();
  }

  return [];
}

/**
 * Middleware to enforce RAG feature access based on the user's active subscription.
 *
 * Attach to any route that uses knowledge-bank / document-upload / RAG endpoints.
 *
 * Behaviour:
 *  - ragType 'none'              → always 403 (feature not included in plan)
 *  - ragType 'basic_text'        → allow text/document files; reject images, audio, video
 *  - ragType 'advanced_multimodal' → allow documents + images; reject audio, video
 *  - ragType 'premium_agentic'   → allow everything
 *  - No file in request          → file-type check is skipped (text-only queries are fine
 *                                   for any plan that has RAG access)
 */
const checkRAGFeature = async (req, res, next) => {
  try {
    // Skip for guests / unauthenticated requests
    if (req.isGuest || !req.user || !req.user._id) {
      return next();
    }

    const userId = req.user._id;
    const tenantId = req.currentTenantId ?? null;

    // ── 1. Get the active subscription for the right context ──────────────────
    const subscription = await SubscriptionModel.findOne(
      tenantId
        ? { tenantId, paymentStatus: 'paid' }
        : { userId, tenantId: null, paymentStatus: 'paid' }
    );

    const ragType = subscription?.limits?.ragType ?? 'none';
    const planName = subscription?.plan_name ?? 'free';

    // ── 2. Block if the plan has no RAG access at all ─────────────────────────
    if (ragType === 'none') {
      logger.warn(
        `RAG access denied — user: ${userId}, plan: ${planName} (ragType: none)`
      );

      throw new ApiError(
        httpStatus.FORBIDDEN,
        'RAG and knowledge-bank features are not available on the Free plan. ' +
          'Upgrade to Explore ($20/mo) for document search, or Execute ($50/mo) ' +
          'for multimodal AI capabilities.'
      );
    }

    // ── 3. Validate uploaded file types against plan allowances ───────────────
    const files = getRequestFiles(req);

    if (files.length > 0) {
      const allowedCategories = ALLOWED_CATEGORIES[ragType] ?? [];

      for (const file of files) {
        const category = getMimeCategory(file.mimetype);

        if (!category) {
          // Unknown MIME type — reject to be safe
          throw new ApiError(
            httpStatus.UNSUPPORTED_MEDIA_TYPE,
            `Unsupported file type: "${file.mimetype}". ` +
              'Please upload a recognised document, image, audio, or video file.'
          );
        }

        if (!allowedCategories.includes(category)) {
          const planUpgradeHint = buildUpgradeHint(
            ragType,
            category,
            file.originalname
          );

          logger.warn(
            `File type blocked — user: ${userId}, plan: ${planName} (ragType: ${ragType}), ` +
              `file: "${file.originalname}", category: ${category}`
          );

          throw new ApiError(httpStatus.FORBIDDEN, planUpgradeHint);
        }
      }
    }

    // ── 4. Expose ragType downstream (controllers can use it for routing) ──────
    req.ragType = ragType;

    logger.info(
      `RAG access granted — user: ${userId}, plan: ${planName}, ragType: ${ragType}` +
        (files.length
          ? `, files: ${files.map((f) => f.originalname).join(', ')}`
          : '')
    );

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Build a human-readable upgrade hint when a file category is blocked.
 * @param {string} ragType   - The user's current RAG tier
 * @param {string} category  - The blocked file category (image/audio/video)
 * @param {string} filename  - The rejected file name
 * @returns {string}
 */
function buildUpgradeHint(ragType, category, filename) {
  const planLabels = {
    basic_text: 'Explore ($20/mo)',
    advanced_multimodal: 'Execute ($50/mo)',
    premium_agentic: 'Command ($100/mo)',
  };

  const categoryFriendly = {
    image: 'image files',
    audio: 'audio files',
    video: 'video files',
  };

  const blocked = categoryFriendly[category] ?? `${category} files`;

  if (ragType === 'basic_text') {
    // basic_text → can't do images/audio/video
    return (
      `Your current plan (Explore) does not support ${blocked}. ` +
      `"${filename}" was rejected. ` +
      'Upgrade to Execute ($50/mo) for multimodal document + image analysis, ' +
      'or Command ($100/mo) for full audio and video support.'
    );
  }

  if (ragType === 'advanced_multimodal') {
    // advanced_multimodal → can't do audio/video
    return (
      `Your current plan (Execute) does not support ${blocked}. ` +
      `"${filename}" was rejected. ` +
      'Upgrade to Command ($100/mo) to unlock audio and video file processing.'
    );
  }

  // Fallback
  return (
    `File type "${category}" is not allowed on your current plan. ` +
    `"${filename}" was rejected. Please upgrade your plan for broader file support.`
  );
}

export default checkRAGFeature;
