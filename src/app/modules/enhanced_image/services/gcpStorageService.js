import { Storage } from '@google-cloud/storage';

export class GCPStorageService {
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
   * @param {string} destinationFileName - Destination file name in bucket
   * @param {string} contentType - MIME type of the file to be uploaded
   * @param {number} expiresMinutes - Expiration time in minutes (default 15)
   * @returns {Promise<string>} - Signed URL for PUT request
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
   * @param {string} fileName - File name in bucket
   * @param {number} expiresMinutes - Expiration time in minutes (default 15)
   * @returns {Promise<string>} - Signed URL for GET request
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
   * This avoids writing files to the local ephemeral container filesystem.
   * @param {string} destinationFileName - Destination file name in bucket
   * @param {string} contentType - MIME type of the file
   * @returns {import('stream').Writable} - Writable stream
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
   * Upload a file to GCP bucket (Deprecated: Use getUploadStream or getSignedUrlForUpload to avoid local disk writes)
   * @param {string} localFilePath - Local file path. WARNING: Ensure this path is not user-controlled to prevent path traversal vulnerabilities.
   * @param {string} destinationFileName - Destination file name in bucket
   * @returns {Promise<string>} - Public URL of uploaded file
   */
  async uploadFile(localFilePath, destinationFileName) {
    try {
      await this.bucket.upload(localFilePath, {
        destination: destinationFileName,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Return public URL (bucket is already public via uniform bucket-level access)
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destinationFileName}`;
      return publicUrl;
    } catch (error) {
      console.error('Error uploading to GCP:', error);
      throw error;
    }
  }

  /**
   * Upload buffer directly to GCP bucket
   * @param {Buffer} buffer - File buffer
   * @param {string} destinationFileName - Destination file name in bucket
   * @param {string} contentType - MIME type (e.g., 'image/png')
   * @returns {Promise<string>} - Public URL of uploaded file
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
   * Delete a file from GCP bucket
   * @param {string} fileName - File name to delete. WARNING: Ensure proper authorization checks are performed by the caller to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
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
   * Check if bucket exists and is accessible
   * @returns {Promise<boolean>}
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