import { Storage } from '@google-cloud/storage';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// The client automatically authenticates using GOOGLE_APPLICATION_CREDENTIALS env variable
const storage = new Storage();

/**
 * Creates a brand new Google Cloud Storage (GCS) bucket.
 * 
 * @param {string} bucketName - Name of the bucket to create
 * @param {string} [location] - Location of the bucket (e.g. 'us-central1')
 * @returns {Promise<object>} Bucket creation report
 */
const createBucket = async (bucketName, location = 'us-central1') => {
  try {
    logger.info(`GCS API: Creating storage bucket "${bucketName}" in location "${location}"...`);

    const [bucket] = await storage.createBucket(bucketName, {
      location,
      storageClass: 'STANDARD'
    });

    return {
      success: true,
      bucketName: bucket.name,
      location: bucket.metadata.location,
      created: bucket.metadata.timeCreated
    };
  } catch (err) {
    logger.error('GCS Bucket Creation Error:', err);
    throw new Error(`GCS Bucket Creation failed: ${err.message}`);
  }
};

/**
 * Generates a secure, temporary pre-signed URL to read or write a file in GCS.
 * 
 * @param {string} bucketName - Bucket name
 * @param {string} fileName - File name / GCS object path
 * @param {string} [action] - 'read' or 'write' (read allows download, write allows upload directly)
 * @param {number} [expiresMinutes] - Expiration duration in minutes (defaults to 15)
 * @returns {Promise<object>} Pre-signed URL report
 */
const generateSignedUrl = async (bucketName, fileName, action = 'read', expiresMinutes = 15) => {
  try {
    logger.info(`GCS API: Generating signed URL for file "${fileName}" inside bucket "${bucketName}" (action: ${action})...`);

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action,
      expires: Date.now() + expiresMinutes * 60 * 1000
    });

    return {
      success: true,
      bucketName,
      fileName,
      action,
      url,
      expiresAt: new Date(Date.now() + expiresMinutes * 60 * 1000)
    };
  } catch (err) {
    logger.error('GCS Pre-Signed URL Error:', err);
    throw new Error(`GCS Signed URL generation failed: ${err.message}`);
  }
};

/**
 * Lists metadata files inside a GCS storage bucket.
 * 
 * @param {string} bucketName - Bucket name
 * @param {string} [prefix] - Optional prefix directory filter (e.g. 'users/123/')
 * @returns {Promise<object>} Listed files report
 */
const listFiles = async (bucketName, prefix = '') => {
  try {
    logger.info(`GCS API: Listing files inside bucket "${bucketName}" matching prefix "${prefix}"...`);

    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix });

    const fileList = files.map(file => ({
      name: file.name,
      id: file.id,
      size: parseFloat(file.metadata.size || '0'),
      updated: file.metadata.updated,
      mimeType: file.metadata.contentType
    }));

    return {
      success: true,
      bucketName,
      prefix,
      files: fileList
    };
  } catch (err) {
    logger.error('GCS Listing Files Error:', err);
    throw new Error(`GCS File Listing failed: ${err.message}`);
  }
};

export const GcpStorageService = {
  createBucket,
  generateSignedUrl,
  listFiles
};
