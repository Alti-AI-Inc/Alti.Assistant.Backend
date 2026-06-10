/**
 * @file This service handles all interactions with Google Cloud Storage (GCS) for audio file management.
 * It provides functionalities for uploading, retrieving signed URLs, deleting, checking existence,
 * and fetching metadata of audio files primarily used for transcription purposes.
 * @module modules/transcription/bucketUpload.service
 * @author Your Name/Team
 */

import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

/**
 * @constant {Storage} storage - Initializes the Google Cloud Storage client.
 * Uses credentials specified in `config.google.google_application_credentials` or a default `alti_gcp.json` file.
 * The project ID is also configured via `config.google.gcp_project_id`.
 */
const storage = new Storage({
  keyFilename:
    config.google?.google_application_credentials || './alti_gcp.json',
  projectId: config.google?.gcp_project_id,
});

/**
 * @constant {string} BUCKET_NAME - The name of the Google Cloud Storage bucket used for transcription files.
 * Defaults to 'alti_assistant_transcription' if not specified in `config.gcs.transcription_bucket`.
 */
const BUCKET_NAME = config.gcs?.transcription_bucket || 'alti_assistant_transcription';

/**
 * @constant {Bucket} bucket - A reference to the specific Google Cloud Storage bucket.
 * All file operations will be performed on this bucket.
 */
const bucket = storage.bucket(BUCKET_NAME);

/**
 * Uploads an audio file from a buffer in memory to the configured Google Cloud Storage bucket.
 * This function streams the file directly to GCS without writing to the local filesystem.
 *
 * @function uploadAudioToBucket
 * @param {Buffer} fileBuffer - The buffer containing the audio file data.
 * @param {string} originalName - The original filename of the audio file (e.g., 'my_audio.mp3').
 * @param {string} mimeType - The MIME type of the audio file (e.g., 'audio/mpeg', 'audio/wav').
 * @returns {Promise<Object>} A promise that resolves with an object containing details of the uploaded file.
 * @property {string} gsUri - The Google Cloud Storage URI of the uploaded file (e.g., `gs://bucket-name/path/to/file.mp3`).
 * @property {string} publicUrl - The public HTTP URL to access the uploaded file (if public access is enabled).
 * @property {string} bucketName - The name of the GCS bucket where the file was uploaded.
 * @property {string} fileName - The unique filename generated and used in GCS (e.g., `transcriptions/12345-original.mp3`).
 * @property {string} originalName - The original name of the file provided during upload.
 * @property {string} mimeType - The MIME type of the uploaded file.
 * @property {number} size - The size of the uploaded file in bytes.
 */
const uploadAudioToBucket = (fileBuffer, originalName, mimeType) => {
  return new Promise((resolve, reject) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${uniqueSuffix}-${originalName}`;
    const destination = `transcriptions/${fileName}`;

    logger.info(`Uploading audio to GCP bucket via stream: ${destination}`);

    const file = bucket.file(destination);
    const stream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName: originalName,
          uploadTimestamp: new Date().toISOString(),
        },
      },
      resumable: false, // Use simple upload for in-memory buffers
    });

    stream.on('error', err => {
      logger.error('Error uploading audio to GCP bucket via stream:', err);
      reject(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to upload audio to GCP storage'
        )
      );
    });

    stream.on('finish', () => {
      const gsUri = `gs://${BUCKET_NAME}/${destination}`;
      const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destination}`;
      logger.info(`Audio uploaded successfully via stream: ${gsUri}`);

      resolve({
        gsUri: gsUri, // gs:// URI for Gemini
        publicUrl: publicUrl,
        bucketName: BUCKET_NAME,
        fileName: destination,
        originalName: originalName,
        mimeType,
        size: fileBuffer.length, // Get size from buffer
      });
    });

    stream.end(fileBuffer);
  });
};

/**
 * Generates a v4 signed URL for uploading a file directly to GCS from the client.
 * This allows the client to upload without the file data passing through the backend server,
 * which is the recommended approach for stateless services.
 *
 * @function generateV4UploadSignedUrl
 * @param {string} originalName - The original filename of the audio file (e.g., 'my_audio.mp3').
 * @param {string} mimeType - The MIME type of the audio file (e.g., 'audio/mpeg', 'audio/wav').
 * @returns {Promise<Object>} A promise that resolves with an object containing the signed URL and file details.
 * @property {string} signedUrl - The URL the client should use to PUT the file.
 * @property {string} fileName - The unique filename that will be created in GCS.
 * @property {string} gsUri - The GCS URI of the file once uploaded.
 * @throws {ApiError} If there is an error generating the signed URL.
 */
const generateV4UploadSignedUrl = async (originalName, mimeType) => {
  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${uniqueSuffix}-${originalName.replace(/\s/g, '_')}`;
    const destination = `transcriptions/${fileName}`;

    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: mimeType,
    };

    const [signedUrl] = await bucket.file(destination).getSignedUrl(options);

    logger.info(`Generated v4 upload signed URL for: ${destination}`);

    return {
      signedUrl,
      fileName: destination,
      gsUri: `gs://${BUCKET_NAME}/${destination}`,
    };
  } catch (error) {
    logger.error('Error generating v4 upload signed URL:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Could not create a secure upload URL.'
    );
  }
};

/**
 * Generates a signed URL for private audio files stored in the GCS bucket, allowing temporary access.
 * This URL can be used to securely access the file without making it publicly available.
 *
 * @function getSignedUrl
 * @param {string} fileName - The full path of the file within the GCS bucket (e.g., `transcriptions/12345-audio.mp3`).
 * @param {number} [expiresIn=3600] - The duration in seconds for which the signed URL will be valid. Defaults to 1 hour (3600 seconds).
 * @returns {Promise<string>} A promise that resolves with the generated signed URL.
 * @throws {ApiError} If there is an error generating the signed URL.
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
 * Deletes an audio file from the Google Cloud Storage bucket.
 * Errors during deletion are logged but not re-thrown to ensure graceful degradation.
 *
 * @function deleteAudioFromBucket
 * @param {string} fileName - The full path of the file within the GCS bucket to be deleted.
 * @returns {Promise<void>} A promise that resolves once the file is deleted or if an error occurs (error is logged).
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
 * Checks if an audio file exists in the Google Cloud Storage bucket.
 *
 * @function audioExistsInBucket
 * @param {string} fileName - The full path of the file within the GCS bucket to check.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the file exists, `false` otherwise.
 * @throws {ApiError} If there is an error while checking the file's existence.
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
 * Retrieves metadata for a specific audio file stored in the Google Cloud Storage bucket.
 *
 * @function getAudioMetadata
 * @param {string} fileName - The full path of the file within the GCS bucket to retrieve metadata for.
 * @returns {Promise<Object>} A promise that resolves with an object containing key metadata about the file.
 * @property {string} size - The size of the file in bytes.
 * @property {string} mimeType - The MIME type of the file.
 * @property {string} created - ISO 8601 timestamp of when the file was created.
 * @property {string} updated - ISO 8601 timestamp of when the file was last updated.
 * @property {Object} metadata - Custom metadata associated with the file, if any.
 * @property {string} gsUri - The Google Cloud Storage URI of the file.
 * @throws {ApiError} If there is an error retrieving the file metadata.
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

/**
 * @constant {Object} bucketUploadService - An object encapsulating all Google Cloud Storage bucket operations
 * related to audio file management for transcription.
 * @property {function(Buffer, string, string): Promise<Object>} uploadAudioToBucket - Uploads an audio file from a buffer to GCS.
 * @property {function(string, string): Promise<Object>} generateV4UploadSignedUrl - Generates a signed URL for direct client-side uploads.
 * @property {function(string, number): Promise<string>} getSignedUrl - Generates a signed URL for private file access.
 * @property {function(string): Promise<void>} deleteAudioFromBucket - Deletes an audio file from GCS.
 * @property {function(string): Promise<boolean>} audioExistsInBucket - Checks if an audio file exists in GCS.
 * @property {function(string): Promise<Object>} getAudioMetadata - Retrieves metadata for an audio file from GCS.
 */
export const bucketUploadService = {
  uploadAudioToBucket,
  generateV4UploadSignedUrl,
  getSignedUrl,
  deleteAudioFromBucket,
  audioExistsInBucket,
  getAudioMetadata,
};