import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../../../../config/index.js';
// INTEGRATION: Import models to handle usage tracking and limit enforcement.
// Note: The exact path may vary based on project structure.
import User from '../../user/models/user.model.js';
import Workspace from '../../workspace/models/workspace.model.js';


/**
 * @file This service handles uploading and deleting presentation files to/from Google Cloud Storage (GCS).
 * It supports uploading files from both remote URLs and local file paths, including specific handling
 * for files originating from the Presenton API's local storage.
 * It ensures files are stored in an organized manner within GCS and handles potential filename conflicts.
 * CRITICAL: This service also enforces workspace storage limits and updates usage metrics.
 */

// Resolve __filename and __dirname for ES Modules to correctly locate files
/**
 * The absolute path of the current module file.
 * @type {string}
 */
const __filename = fileURLToPath(import.meta.url);
/**
 * The absolute path of the directory containing the current module file.
 * @type {string}
 */
const __dirname = path.dirname(__filename);

/**
 * Google Cloud Storage client instance.
 * Initialized with project ID and service account key file path from configuration.
 * The keyFilename is resolved to an absolute path for robustness.
 * @type {Storage}
 */
const storage = new Storage({
  projectId: config.google.gcp_project_id,
  // FIX: Resolve keyFilename to an absolute path for robustness.
  // This prevents issues if the application's working directory changes.
  // Assuming 'alti_gcp.json' is located at the project root, 4 levels up from this service file.
  keyFilename: path.join(__dirname, '../../../../alti_gcp.json'),
});

/**
 * The name of the Google Cloud Storage bucket designated for presentation files.
 * @type {string}
 */
const PRESENTATION_BUCKET = config.gcs.presentation_bucket;

/**
 * Determines the appropriate MIME content type based on a file's extension.
 * Supports common presentation and document formats like PPTX, PDF, and JSON.
 *
 * @param {string} filePath - The full path or filename of the file.
 * @returns {string} The MIME content type string (e.g., 'application/pdf') or 'application/octet-stream' if unknown.
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
 * Checks if a given string is a valid URL (http or https).
 *
 * @param {string} pathOrUrl - The string to check.
 * @returns {boolean} True if the string is a valid HTTP/HTTPS URL, false otherwise.
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
 * Uploads a presentation file to Google Cloud Storage.
 * This function handles files from remote URLs or local paths, enforces workspace storage limits,
 * updates usage metrics, and provides secure access via a signed URL.
 * For local files, it includes security checks to prevent path traversal attacks.
 * Files are organized in GCS by `userId/conversationId/fileName`.
 * If a file with the same name already exists, a unique name is generated.
 *
 * @param {string} presentonPathOrUrl - The URL or local file path of the presentation.
 * @param {string} fileName - The desired name for the file in GCS.
 * @param {string} userId - The ID of the user, used for organizing files and checking permissions.
 * @param {string} conversationId - The ID of the conversation, used for organizing files.
 * @returns {Promise<Object>} An object containing the upload result:
 * @property {boolean} success - True if the upload was successful.
 * @property {string} url - The short-lived, secure signed URL for accessing the file.
 * @property {string} gcsPath - The full path of the file within the GCS bucket.
 * @property {string} bucket - The name of the GCS bucket where the file was uploaded.
 * @property {number} size - The size of the uploaded file in bytes.
 * @throws {Error} If storage limits are exceeded, the file cannot be processed, or a security issue is detected.
 */
export const uploadPresentationToGCS = async (
  presentonPathOrUrl,
  fileName,
  userId,
  conversationId
) => {
  try {
    let fileBuffer;

    if (isUrl(presentonPathOrUrl)) {
      console.log('Downloading presentation from URL:', presentonPathOrUrl);
      const response = await axios.get(presentonPathOrUrl, {
        responseType: 'arraybuffer',
      });
      fileBuffer = Buffer.from(response.data);
    } else {
      console.log('Reading presentation from local path:', presentonPathOrUrl);
      const presentonBaseDir = '/app/presenton_files';

      if (!presentonPathOrUrl.startsWith('/app_data/')) {
        throw new Error('Invalid Presenton file path format. Expected to start with /app_data/.');
      }

      const relativePresentonPath = presentonPathOrUrl.substring('/app_data/'.length);
      const resolvedFilePath = path.resolve(presentonBaseDir, relativePresentonPath);

      if (!resolvedFilePath.startsWith(presentonBaseDir + path.sep) && resolvedFilePath !== presentonBaseDir) {
        throw new Error('Attempted path traversal detected. File access denied.');
      }

      console.log('Resolved file path:', resolvedFilePath);
      fileBuffer = await fs.readFile(resolvedFilePath);
      console.log('File read successfully, size:', fileBuffer.length);
    }

    const fileSize = fileBuffer.length;

    // HIERARCHY GAP FIX: Validate against workspace storage limits before uploading.
    const user = await User.findById(userId).populate('workspace').lean();
    if (!user || !user.workspace) {
      throw new Error('User or associated workspace not found.');
    }
    const workspace = user.workspace;

    if (workspace.storageUsed + fileSize > workspace.storageLimit) {
      // TODO: Implement notification logic to inform workspace admins about reaching the limit.
      throw new Error(
        `Uploading this file would exceed your workspace storage limit. Used: ${workspace.storageUsed}, Limit: ${workspace.storageLimit}, File: ${fileSize}`
      );
    }

    const contentType = getContentType(fileName);
    const bucket = storage.bucket(PRESENTATION_BUCKET);
    let gcsPath = `${userId}/${conversationId}/${fileName}`;
    let file = bucket.file(gcsPath);

    let counter = 1;
    let [exists] = await file.exists();

    while (exists) {
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      const newFileName = `${nameWithoutExt}_${counter}${ext}`;
      gcsPath = `${userId}/${conversationId}/${newFileName}`;
      file = bucket.file(gcsPath);
      [exists] = await file.exists();
      counter++;
    }

    await file.save(fileBuffer, {
      metadata: {
        contentType,
        // INTEGRATION: Add custom metadata for easier usage tracking and management.
        metadata: {
          userId,
          workspaceId: workspace._id.toString(),
          conversationId,
        },
      },
      resumable: false,
    });

    // HIERARCHY GAP FIX: Update workspace usage after a successful upload.
    await Workspace.findByIdAndUpdate(workspace._id, {
      $inc: { storageUsed: fileSize },
    });

    // SECURITY FIX: Generate a short-lived signed URL instead of making the file public.
    // This ensures that access to potentially sensitive presentation data is controlled and temporary.
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // URL is valid for 15 minutes
    });

    return {
      success: true,
      url: signedUrl, // Formerly publicUrl, now a secure signed URL
      gcsPath,
      bucket: PRESENTATION_BUCKET,
      size: fileSize,
    };
  } catch (error) {
    console.error('Error uploading presentation to GCS:', error);
    // Propagate a user-friendly error message.
    throw new Error(`Failed to upload presentation: ${error.message}`);
  }
};

/**
 * Deletes a specified file from the GCS presentation bucket and updates workspace storage usage.
 *
 * @param {string} gcsPath - The full path of the file within the GCS bucket (e.g., `userId/conversationId/fileName.pptx`).
 * @returns {Promise<boolean>} True if the file was successfully deleted, false otherwise.
 */
export const deleteFromGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(PRESENTATION_BUCKET);
    const file = bucket.file(gcsPath);

    // HIERARCHY GAP FIX: Get file metadata to retrieve size and workspaceId for usage update.
    const [metadata] = await file.getMetadata();
    const fileSize = parseInt(metadata.size, 10);
    // Retrieve workspaceId from custom metadata set during upload for robust tracking.
    const workspaceId = metadata.metadata?.workspaceId;

    // Delete the file from GCS first. If this fails, we don't update the database.
    await file.delete();

    // If we have the necessary info, update the workspace's storage usage.
    if (workspaceId && fileSize > 0) {
      await Workspace.findByIdAndUpdate(workspaceId, {
        $inc: { storageUsed: -fileSize },
      });
      console.log(`Successfully deleted ${gcsPath} and updated storage for workspace ${workspaceId}.`);
    } else {
      // Log a warning if metadata is missing, as usage won't be updated.
      // This could happen for files uploaded before this logic was implemented.
      console.warn(`Could not update storage usage for ${gcsPath}. Workspace metadata missing.`);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting file ${gcsPath} from GCS:`, error);
    // If the error is that the file doesn't exist, the desired state is achieved.
    if (error.code === 404) {
      console.log('File not found in GCS, deletion considered successful.');
      return true;
    }
    return false;
  }
};