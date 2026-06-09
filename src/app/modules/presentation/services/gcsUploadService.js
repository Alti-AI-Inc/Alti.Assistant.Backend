import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../../../../config/index.js';

// Resolve __filename and __dirname for ES Modules to correctly locate files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = new Storage({
  projectId: config.google.gcp_project_id,
  // FIX: Resolve keyFilename to an absolute path for robustness.
  // This prevents issues if the application's working directory changes.
  // Assuming 'alti_gcp.json' is located at the project root, 4 levels up from this service file.
  keyFilename: path.join(__dirname, '../../../../alti_gcp.json'),
});

const PRESENTATION_BUCKET = config.gcs.presentation_bucket;

/**
 * Get content type based on file extension
 */
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
  };
  return contentTypeMap[ext] || 'application/octet-stream';
};

/**
 * Check if a path is a URL or local file path
 * @param {string} pathOrUrl - Path or URL to check
 * @returns {boolean} - True if URL, false if local path
 */
const isUrl = (pathOrUrl) => {
  try {
    const url = new URL(pathOrUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Upload presentation file to Google Cloud Storage
 * @param {string} presentonPathOrUrl - URL or local path of the presentation from Presenton API
 * @param {string} fileName - Name for the file in GCS
 * @param {string} userId - User ID for organizing files
 * @param {string} conversationId - Conversation ID for organizing files
 * @returns {Promise<Object>} - Upload result with public URL
 */
export const uploadPresentationToGCS = async (
  presentonPathOrUrl,
  fileName,
  userId,
  conversationId
) => {
  try {
    let fileBuffer;

    // Check if it's a URL or local file path
    if (isUrl(presentonPathOrUrl)) {
      // Download file from URL
      console.log('Downloading presentation from URL:', presentonPathOrUrl);
      const response = await axios.get(presentonPathOrUrl, {
        responseType: 'arraybuffer',
      });
      fileBuffer = Buffer.from(response.data);
    } else {
      // Read file from local file system
      console.log('Reading presentation from local path:', presentonPathOrUrl);

      // Handle paths from Presenton API
      // Presenton returns paths like: /app_data/exports/file.pptx
      // In Docker, Presenton's /app_data is mounted to our /app/presenton_files via shared volume
      let filePath;

      // FIX: Implement robust path traversal prevention.
      // Map Presenton's /app_data path to our shared volume mount at /app/presenton_files.
      const presentonBaseDir = '/app/presenton_files';

      // Ensure the input path starts with the expected Presenton prefix to prevent unexpected file access.
      if (!presentonPathOrUrl.startsWith('/app_data/')) {
        throw new Error('Invalid Presenton file path format. Expected to start with /app_data/.');
      }

      // Extract the relative path after '/app_data/'.
      const relativePresentonPath = presentonPathOrUrl.substring('/app_data/'.length);

      // Resolve the path against our base directory for Presenton files.
      // path.resolve will normalize the path and handle '..' segments.
      const resolvedFilePath = path.resolve(presentonBaseDir, relativePresentonPath);

      // CRITICAL SECURITY CHECK: Ensure the resolved path is still within the intended base directory.
      // This prevents path traversal attacks where 'relativePresentonPath' might contain '..'
      // to escape 'presentonBaseDir' and access arbitrary files on the server.
      if (!resolvedFilePath.startsWith(presentonBaseDir + path.sep) && resolvedFilePath !== presentonBaseDir) {
        throw new Error('Attempted path traversal detected. File access denied.');
      }

      filePath = resolvedFilePath;

      console.log('Resolved file path:', filePath);
      fileBuffer = await fs.readFile(filePath);
      console.log('File read successfully, size:', fileBuffer.length);
    }

    const contentType = getContentType(fileName);

    // Create organized path: userId/conversationId/fileName
    // Handle duplicate filenames by adding numbers
    const bucket = storage.bucket(PRESENTATION_BUCKET);
    let gcsPath = `${userId}/${conversationId}/${fileName}`;
    let file = bucket.file(gcsPath);

    // Check if file exists and find unique name
    let counter = 1;
    let exists = await file.exists();

    while (exists[0]) {
      // File exists, add counter before extension
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      const newFileName = `${nameWithoutExt}_${counter}${ext}`;
      gcsPath = `${userId}/${conversationId}/${newFileName}`;
      file = bucket.file(gcsPath);
      exists = await file.exists();
      counter++;
    }

    // Upload to GCS
    await file.save(fileBuffer, {
      metadata: {
        contentType,
      },
      resumable: false,
    });

    // FIX: Uncomment to make the file publicly accessible if the 'publicUrl' is intended to work.
    // If public access is not desired, the 'publicUrl' should be removed or replaced with a signed URL.
    await file.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${PRESENTATION_BUCKET}/${gcsPath}`;

    return {
      success: true,
      publicUrl,
      gcsPath,
      bucket: PRESENTATION_BUCKET,
      size: fileBuffer.length,
    };
  } catch (error) {
    console.error('Error uploading presentation to GCS:', error);
    throw new Error(`Failed to upload presentation to GCS: ${error.message}`);
  }
};

/**
 * Delete a file from GCS
 * @param {string} gcsPath - Path of the file in GCS
 * @returns {Promise<boolean>} - Success status
 */
export const deleteFromGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(PRESENTATION_BUCKET);
    const file = bucket.file(gcsPath);
    await file.delete();
    return true;
  } catch (error) {
    console.error('Error deleting file from GCS:', error);
    return false;
  }
};