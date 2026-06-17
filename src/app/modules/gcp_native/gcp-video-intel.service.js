import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';
import { TenantUsageService } from '../tenant/tenant-usage.service.js';
import { NotificationService } from '../notification/notification.service.js';

/**
 * @constant {GoogleAuth} auth
 * @description GoogleAuth client configured with 'cloud-platform' scope for accessing Google Cloud APIs.
 *              This client handles authentication details automatically based on the environment
 *              (e.g., service account key file, GCE metadata, gcloud CLI credentials).
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * @constant {Array<string>} VALID_VIDEO_FEATURES
 * @description A whitelist of valid features supported by the Google Cloud Video Intelligence API.
 */
const VALID_VIDEO_FEATURES = [
  'LABEL_DETECTION',
  'SHOT_CHANGE_DETECTION',
  'EXPLICIT_CONTENT_DETECTION',
  'TEXT_DETECTION'
];

/**
 * Validates the user context, roles, and tenant boundaries to prevent IDOR and unauthorized access.
 * Supports: super_admin (platform owner), admin (workspace owner), manager, user.
 * 
 * @param {object} context - The user/request context containing user details.
 * @param {string} [operationTenantId=null] - Optional tenant ID of the resource being accessed to enforce boundaries.
 * @throws {Error} If validation fails.
 */
const validateUserContext = (context, operationTenantId = null) => {
  if (!context || !context.user) {
    throw new Error('Unauthorized: User context is missing.');
  }

  const { role, tenantId } = context.user;
  const validRoles = ['super_admin', 'admin', 'manager', 'user'];

  if (!validRoles.includes(role)) {
    throw new Error(`Unauthorized: Invalid role '${role}'.`);
  }

  // super_admin (platform owner) has global access and bypasses tenant checks
  if (role === 'super_admin') {
    return;
  }

  if (!tenantId) {
    throw new Error('Unauthorized: Tenant context is missing.');
  }

  // Prevent IDOR / Tenant boundary violation
  if (operationTenantId && tenantId !== operationTenantId) {
    throw new Error('Unauthorized: Tenant context boundary violation.');
  }
};

/**
 * Propagates usage details, checks limits, and sends notifications up the hierarchy.
 * 
 * @param {object} context - The user/request context.
 * @param {string} action - The action being performed (e.g., 'video_analysis').
 * @param {number} amount - The usage amount.
 */
const propagateUsageAndNotifications = async (context, action, amount = 1) => {
  const { user } = context;
  const { id: userId, role, tenantId, managerId } = user;

  // 1. Track and increment usage for the tenant
  if (role !== 'super_admin') {
    await TenantUsageService.trackUsage(tenantId, userId, action, amount);
  }

  // 2. Propagate notifications up the hierarchy
  const notificationPayload = {
    title: 'Video Analysis Triggered',
    message: `User ${userId} (${role}) initiated video analysis.`,
    metadata: { userId, tenantId, action, amount }
  };

  // Notify manager if the user has one
  if (managerId) {
    await NotificationService.sendNotification(managerId, {
      ...notificationPayload,
      message: `Your direct report (User ${userId}) initiated video analysis.`
    });
  }

  // Notify tenant administrators
  if (role !== 'super_admin' && role !== 'admin') {
    await NotificationService.notifyTenantAdmins(tenantId, {
      ...notificationPayload,
      message: `Tenant user ${userId} initiated video analysis.`
    });
  }

  // Notify platform owners (super_admins) for platform-level tracking
  if (role === 'super_admin') {
    await NotificationService.notifyPlatformOwners({
      ...notificationPayload,
      message: `Platform Super Admin ${userId} initiated video analysis.`
    });
  }
};

/**
 * Initiates a video annotation operation using Google Cloud Video Intelligence.
 * Supports various analysis features like label detection, text detection (OCR),
 * shot change detection, and content moderation.
 *
 * @async
 * @param {string} [inputUri=null] - GCS URI of the video file (e.g., 'gs://bucket/video.mp4').
 *   Required if `inputContent` is not provided.
 * @param {string} [inputContent=null] - Base64 encoded video content string.
 *   Required if `inputUri` is not provided.
 * @param {Array<string>} [features=['LABEL_DETECTION', 'TEXT_DETECTION']] - List of analysis features to enable.
 * @param {object} [context={}] - User context for role validation, tenant boundaries, and usage tracking.
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, metadata: object | undefined }>}
 * @throws {Error} If validation fails, limits are exceeded, or the API call fails.
 */
const startVideoAnalysis = async (inputUri = null, inputContent = null, features = ['LABEL_DETECTION', 'TEXT_DETECTION'], context = {}) => {
  try {
    // Validate context and roles
    validateUserContext(context);

    if (!inputUri && !inputContent) {
      throw new Error('Either inputUri (GCS link) or inputContent (base64) must be provided.');
    }

    // Validate provided features against a whitelist to prevent invalid API requests.
    const invalidFeatures = features.filter(f => !VALID_VIDEO_FEATURES.includes(f));
    if (invalidFeatures.length > 0) {
      throw new Error(`Invalid video analysis features provided: ${invalidFeatures.join(', ')}. Valid features are: ${VALID_VIDEO_FEATURES.join(', ')}.`);
    }

    // Check quota limits before proceeding
    if (context.user.role !== 'super_admin') {
      const hasQuota = await TenantUsageService.checkQuota(context.user.tenantId, 'video_analysis', 1);
      if (!hasQuota) {
        throw new Error('QuotaExceeded: Tenant has exceeded the video analysis quota limit.');
      }
    }

    logger.info(`Video Intel API: Starting annotation with features: ${features.join(', ')} for tenant: ${context.user.tenantId || 'platform'}`);

    const client = await auth.getClient();
    const requestData = { features };

    if (inputUri) {
      requestData.inputUri = inputUri;
    } else {
      requestData.inputContent = inputContent;
    }

    const response = await client.request({
      url: 'https://videointelligence.googleapis.com/v1/videos:annotate',
      method: 'POST',
      data: requestData
    });

    const operationName = response.data?.name;
    if (!operationName) {
      throw new Error('GCP Video Intelligence API did not return an operation name.');
    }

    // Propagate usage and notifications up the hierarchy
    await propagateUsageAndNotifications(context, 'video_analysis', 1);

    return {
      success: true,
      operationName,
      done: response.data?.done || false,
      metadata: response.data?.metadata
    };
  } catch (err) {
    logger.error('GCP Video Intel Service Error:', err);
    throw new Error(`GCP Video Analysis trigger failed: ${err.message}`);
  }
};

/**
 * Checks the status of a running Google Cloud Video Intelligence operation.
 * If the operation is complete, it parses and returns the annotation results.
 *
 * @async
 * @param {string} operationName - The full name of the video annotation operation.
 * @param {object} context - User context for role validation and tenant boundaries.
 * @param {string} [operationTenantId=null] - Tenant ID associated with the operation to prevent IDOR.
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
 * @throws {Error} If validation fails or the API call to check status fails.
 */
const checkVideoAnalysisStatus = async (operationName, context, operationTenantId = null) => {
  try {
    // Validate context and tenant boundary (IDOR prevention)
    validateUserContext(context, operationTenantId);

    logger.info(`Video Intel API: Querying status for operation: ${operationName} (Tenant: ${operationTenantId || 'platform'})`);

    const client = await auth.getClient();
    const response = await client.request({
      url: `https://videointelligence.googleapis.com/v1/${operationName}`,
      method: 'GET'
    });

    const data = response.data || {};
    const done = data.done || false;

    let results = null;
    if (done && data.response) {
      const annotationResults = data.response.annotationResults?.[0] || {};

      // Cleanly map results for easy developer consumption
      const labels = (annotationResults.segmentLabelAnnotations || []).map(label => ({
        entity: label.entity?.description,
        categories: (label.categoryEntities || []).map(cat => cat.description),
        segments: (label.segments || []).map(seg => ({
          start: parseFloat(seg.segment?.startTimeOffset || '0'),
          end: parseFloat(seg.segment?.endTimeOffset || '0'),
          confidence: seg.confidence
        }))
      }));

      const text = (annotationResults.textAnnotations || []).map(txt => ({
        text: txt.text,
        segments: (txt.segments || []).map(seg => ({
          start: parseFloat(seg.segment?.startTimeOffset || '0'),
          end: parseFloat(seg.segment?.endTimeOffset || '0'),
          confidence: seg.confidence
        }))
      }));

      const explicit = (annotationResults.explicitAnnotation?.frames || []).map(frame => ({
        timeOffset: parseFloat(frame.timeOffset || '0'),
        pornographyLikelihood: frame.pornographyLikelihood
      }));

      const shots = (annotationResults.shotAnnotations || []).map(shot => ({
        start: parseFloat(shot.startTimeOffset || '0'),
        end: parseFloat(shot.endTimeOffset || '0')
      }));

      results = { labels, text, explicit, shots };
    }

    return {
      success: true,
      operationName,
      done,
      results,
      raw: data
    };
  } catch (err) {
    logger.error(`GCP Video Intel Status Check Error for ${operationName}:`, err);
    throw new Error(`GCP Video Status Check failed: ${err.message}`);
  }
};

/**
 * Synchronously polls a Google Cloud Video Intelligence operation until it completes or a timeout is reached.
 *
 * @async
 * @param {string} operationName - The full name of the video annotation operation to poll.
 * @param {object} context - User context for role validation and tenant boundaries.
 * @param {string} [operationTenantId=null] - Tenant ID associated with the operation to prevent IDOR.
 * @param {number} [intervalMs=5000] - The interval in milliseconds between polling attempts.
 * @param {number} [maxAttempts=24] - The maximum number of polling attempts before timing out.
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
 * @throws {Error} If polling times out or if check status throws an error.
 */
const pollVideoAnalysis = async (operationName, context, operationTenantId = null, intervalMs = 5000, maxAttempts = 24) => {
  let attempts = 0;
  while (attempts < maxAttempts) {
    logger.info(`Video Intel Polling: Attempt ${attempts + 1}/${maxAttempts} for ${operationName}...`);
    const status = await checkVideoAnalysisStatus(operationName, context, operationTenantId);
    if (status.done) {
      return status;
    }
    attempts++;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Video Analysis polling timed out after ${(attempts * intervalMs) / 1000} seconds.`);
};

/**
 * @namespace GcpVideoIntelService
 * @description Service module for interacting with Google Cloud Video Intelligence API.
 *   Provides functions to start video analysis, check operation status, and poll for completion.
 */
export const GcpVideoIntelService = {
  /**
   * @function startVideoAnalysis
   * @memberof GcpVideoIntelService
   * @description Initiates a video annotation operation with role validation, limits, and notifications.
   * @param {string} [inputUri=null] - GCS URI of the video file.
   * @param {string} [inputContent=null] - Base64 encoded video content string.
   * @param {Array<string>} [features=['LABEL_DETECTION', 'TEXT_DETECTION']] - List of analysis features.
   * @param {object} [context={}] - User context for role validation, tenant boundaries, and usage tracking.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, metadata: object | undefined }>}
   */
  startVideoAnalysis,
  /**
   * @function checkVideoAnalysisStatus
   * @memberof GcpVideoIntelService
   * @description Checks the status and retrieves results of a video annotation operation with tenant boundary validation.
   * @param {string} operationName - The full name of the video annotation operation.
   * @param {object} context - User context for role validation and tenant boundaries.
   * @param {string} [operationTenantId=null] - Tenant ID associated with the operation to prevent IDOR.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
   */
  checkVideoAnalysisStatus,
  /**
   * @function pollVideoAnalysis
   * @memberof GcpVideoIntelService
   * @description Polls a video annotation operation until completion or timeout with tenant boundary validation.
   * @param {string} operationName - The full name of the video annotation operation to poll.
   * @param {object} context - User context for role validation and tenant boundaries.
   * @param {string} [operationTenantId=null] - Tenant ID associated with the operation to prevent IDOR.
   * @param {number} [intervalMs=5000] - The interval in milliseconds between polling attempts.
   * @param {number} [maxAttempts=24] - The maximum number of polling attempts.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
   */
  pollVideoAnalysis
};