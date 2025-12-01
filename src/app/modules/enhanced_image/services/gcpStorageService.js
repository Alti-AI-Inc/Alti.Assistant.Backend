import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GCPStorageService {
  constructor(bucketName, keyFilePath) {
    this.bucketName = bucketName;
    this.storage = new Storage({
      keyFilename: keyFilePath,
    });
    this.bucket = this.storage.bucket(bucketName);
  }

  /**
   * Upload a file to GCP bucket
   * @param {string} localFilePath - Local file path
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
   * @param {string} fileName - File name to delete
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
