import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename:
    config.google?.google_application_credentials || './alti_gcp.json',
  projectId: config.google?.gcp_project_id,
});

const BUCKET_NAME = 'alti_assistant_transcription';
const bucket = storage.bucket(BUCKET_NAME);

/**
 * Upload audio file to GCP bucket
 * @param {string} filePath - Local file path
 * @param {string} originalName - Original filename
 * @param {string} mimeType - File MIME type
 * @returns {Promise<Object>}
 */
const uploadAudioToBucket = async (filePath, originalName, mimeType) => {
  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(originalName);
    const fileName = `${uniqueSuffix}-${originalName}`;
    const destination = `transcriptions/${fileName}`;

    logger.info(`Uploading audio to GCP bucket: ${destination}`);

    // Upload file to GCS
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName: originalName,
          uploadTimestamp: new Date().toISOString(),
        },
      },
    });

    const file = bucket.file(destination);
    const gsUri = `gs://${BUCKET_NAME}/${destination}`;
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destination}`;

    logger.info(`Audio uploaded successfully: ${gsUri}`);

    return {
      gsUri: gsUri, // gs:// URI for Gemini
      publicUrl: publicUrl,
      bucketName: BUCKET_NAME,
      fileName: destination,
      originalName: originalName,
      mimeType,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error('Error uploading audio to GCP bucket:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to upload audio to GCP storage'
    );
  }
};

/**
 * Get signed URL for private audio file access
 * @param {string} fileName - GCS file path
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>}
 */
const getSignedUrl = async (fileName, expiresIn = 3600) => {
  try {
    const file = bucket.file(fileName);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });

    logger.info(`Generated signed URL for: ${fileName}`);

    return signedUrl;
  } catch (error) {
    logger.error('Error generating signed URL:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate access URL'
    );
  }
};

/**
 * Delete audio file from bucket
 * @param {string} fileName - GCS file path
 * @returns {Promise<void>}
 */
const deleteAudioFromBucket = async (fileName) => {
  try {
    const file = bucket.file(fileName);
    await file.delete();

    logger.info(`Deleted audio from bucket: ${fileName}`);
  } catch (error) {
    logger.error('Error deleting audio from bucket:', error);
    // Don't throw error, just log it (graceful degradation)
  }
};

/**
 * Check if file exists in bucket
 * @param {string} fileName - GCS file path
 * @returns {Promise<boolean>}
 */
const audioExistsInBucket = async (fileName) => {
  try {
    const file = bucket.file(fileName);
    const [exists] = await file.exists();

    return exists;
  } catch (error) {
    logger.error('Error checking audio existence:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to check audio existence'
    );
  }
};

/**
 * Get audio file metadata from bucket
 * @param {string} fileName - GCS file path
 * @returns {Promise<Object>}
 */
const getAudioMetadata = async (fileName) => {
  try {
    const file = bucket.file(fileName);
    const [metadata] = await file.getMetadata();

    return {
      size: metadata.size,
      mimeType: metadata.contentType,
      created: metadata.timeCreated,
      updated: metadata.updated,
      metadata: metadata.metadata,
      gsUri: `gs://${BUCKET_NAME}/${fileName}`,
    };
  } catch (error) {
    logger.error('Error getting audio metadata:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve audio metadata'
    );
  }
};

export const bucketUploadService = {
  uploadAudioToBucket,
  getSignedUrl,
  deleteAudioFromBucket,
  audioExistsInBucket,
  getAudioMetadata,
};
