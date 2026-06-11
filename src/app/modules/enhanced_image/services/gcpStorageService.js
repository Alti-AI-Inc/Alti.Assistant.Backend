import { Storage } from '@google-cloud/storage';

/**
 * @class GCPStorageService
 * @description A service class for interacting with Google Cloud Storage (GCS).
 * Provides methods for uploading, downloading, deleting files, and generating signed URLs.
 * This service is designed to be instantiated once per bucket.
 */
export class GCPStorageService {
  /**
   * Creates an instance of GCPStorageService.
   * @param {string} bucketName - The name of the GCS bucket to interact with.
   * @param {string} keyFilePath - The path to the GCP service account key file (JSON).
   */
  constructor(bucketName, keyFilePath) {
    this.bucketName = bucketName;
    this.storage = new Storage({
      keyFilename: keyFilePath,
    });
    this.bucket = this.storage.bucket(bucketName);
  }

  /**
   * Generate a signed URL for uploading a file directly to GCS.
   * This avoids writing files to the local ephemeral container filesystem.
   * The caller is responsible for ensuring the destinationFileName is unique and,
   * in a multi-tenant environment, properly namespaced by tenant ID.
   * @param {string} destinationFileName - Destination file name in the bucket (e.g., 'tenant-id/images/my-image.png').
   * @param {string} [contentType='image/png'] - MIME type of the file to be uploaded.
   * @param {number} [expiresMinutes=15] - Expiration time for the URL in minutes.
   * @returns {Promise<string>} A promise that resolves to the signed URL for a PUT request.
   */
  async getSignedUrlForUpload(destinationFileName, contentType = 'image/png', expiresMinutes = 15) {
    try {
      const file = this.bucket.file(destinationFileName);
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + expiresMinutes * 60 * 1000,
        contentType: contentType,
      });
      return url;
    } catch (error) {
      console.error('Error generating signed upload URL:', error);
      throw error;
    }
  }

  /**
   * Generate a signed URL for downloading/viewing a file from GCS.
   * The caller is responsible for ensuring the fileName corresponds to a resource
   * the user is authorized to access, especially in a multi-tenant context.
   * @param {string} fileName - The name of the file in the bucket to download (e.g., 'tenant-id/images/my-image.png').
   * @param {number} [expiresMinutes=15] - Expiration time for the URL in minutes.
   * @returns {Promise<string>} A promise that resolves to the signed URL for a GET request.
   */
  async getSignedUrlForDownload(fileName, expiresMinutes = 15) {
    try {
      const file = this.bucket.file(fileName);
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresMinutes * 60 * 1000,
      });
      return url;
    } catch (error) {
      console.error('Error generating signed download URL:', error);
      throw error;
    }
  }

  /**
   * Get a writable stream to upload data directly to GCS.
   * This is useful for streaming large files without buffering them in memory or on disk.
   * The caller is responsible for ensuring the destinationFileName is unique and,
   * in a multi-tenant environment, properly namespaced by tenant ID.
   * @param {string} destinationFileName - Destination file name in the bucket (e.g., 'tenant-id/images/my-image.png').
   * @param {string} [contentType='image/png'] - MIME type of the file.
   * @returns {import('stream').Writable} A writable stream to the GCS file.
   */
  getUploadStream(destinationFileName, contentType = 'image/png') {
    const file = this.bucket.file(destinationFileName);
    return file.createWriteStream({
      metadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000',
      },
      resumable: false,
    });
  }

  /**
   * Uploads a buffer directly to a GCS bucket.
   * This is efficient for handling file data held in memory.
   * The caller is responsible for ensuring the destinationFileName is unique and,
   * in a multi-tenant environment, properly namespaced by tenant ID.
   * @param {Buffer} buffer - The file buffer to upload.
   * @param {string} destinationFileName - Destination file name in the bucket (e.g., 'tenant-id/images/my-image.png').
   * @param {string} [contentType='image/png'] - The MIME type of the file (e.g., 'image/png').
   * @returns {Promise<string>} A promise that resolves to the public URL of the uploaded file.
   */
  async uploadBuffer(buffer, destinationFileName, contentType = 'image/png') {
    try {
      const file = this.bucket.file(destinationFileName);

      await file.save(buffer, {
        metadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Return public URL (bucket is already public via uniform bucket-level access)
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destinationFileName}`;
      return publicUrl;
    } catch (error) {
      console.error('Error uploading buffer to GCP:', error);
      throw error;
    }
  }

  /**
   * Deletes a file from the GCS bucket.
   * @param {string} fileName - The name of the file to delete. WARNING: The caller must perform proper authorization checks to prevent unauthorized deletions (Insecure Direct Object Reference). In a multi-tenant environment, ensure the filename is correctly scoped to the tenant.
   * @returns {Promise<void>} A promise that resolves when the file is deleted.
   */
  async deleteFile(fileName) {
    try {
      await this.bucket.file(fileName).delete();
      console.log(`File ${fileName} deleted from GCP bucket`);
    } catch (error) {
      console.error('Error deleting from GCP:', error);
      throw error;
    }
  }

  /**
   * Checks if the configured bucket exists and is accessible with the provided credentials.
   * @returns {Promise<boolean>} A promise that resolves to true if the bucket exists and is accessible, false otherwise.
   */
  async checkBucketAccess() {
    try {
      const [exists] = await this.bucket.exists();
      return exists;
    } catch (error) {
      console.error('Error checking bucket access:', error);
      return false;
    }
  }
}