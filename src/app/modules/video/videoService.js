import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import globalConfig from '../../../../config/index.js';
import path from 'path';
// import { pipeline } from 'stream/promises'; // Removed: Unused import
import { GoogleAuth } from 'google-auth-library';

/**
 * Generates a video using the specified parameters.
 * This is a placeholder implementation - you'll need to integrate with your preferred video generation API
 * (e.g., RunwayML, Stability AI, Pika Labs, etc.)
 *
 * @param {Object} options - Video generation options
 * @param {string} options.prompt - The detailed prompt for video generation
 * @param {number} options.duration - Duration in seconds (default: 5)
 * @param {string} options.style - Visual style (default: "realistic")
 * @param {string} options.resolution - Video resolution (default: "1024x576")
 * @returns {Promise<Object>} - Object containing videoUrl and metadata
 */
export const generateVideo = async ({
  prompt,
  duration = 5,
  style = 'realistic',
  resolution = '1024x576',
}) => {
  console.log('Generating video with parameters:', {
    prompt,
    duration,
    style,
    resolution,
  });

  try {
    const ai = new GoogleGenAI({
      vertexAI: {
        project: globalConfig.google.gcp_project_id,
        location: globalConfig.google.vertex_ai_region || 'us-central1',
      },
    });

    const modelId = 'veo-3.1-fast-generate-preview'; // Hardcoded model for this function
    const availableModels = await getAvailableVideoModels(); // Get models to find maxDuration
    const currentModel = availableModels.find(m => m.id === modelId);
    // Cap duration to model's max duration, default to 8 seconds if model not found
    const maxDuration = currentModel ? currentModel.maxDuration : 8;
    const actualDuration = Math.min(duration, maxDuration);

    // Bug Fix: Use input duration and resolution, capped by model limits
    let operation = await ai.models.generateVideos({
      model: modelId,
      prompt: prompt,
      config: {
        durationSeconds: actualDuration,
        resolution: resolution, // Assuming '1024x576' is supported or mapped internally by the SDK
      },
    });

    // Poll the operation status until the video is ready.
    while (!operation.done) {
      console.log('Waiting for video generation to complete...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      // Bug Fix: Pass the operation name (string) instead of the full operation object
      operation = await ai.operations.getVideosOperation({
        name: operation.name,
      });
    }
    console.log(
      'Video generation operation completed:',
      JSON.stringify(operation.response.generatedVideos[0].video.uri, null, 2)
    );

    // Upload the generated video directly to bucket without local save
    const fileName = `generated_video_${Date.now()}.mp4`;

    console.log(
      'Video file from operation:',
      JSON.stringify(operation.response.generatedVideos[0].video, null, 2)
    );

    const url = await uploadVideoDirectlyToBucket(
      operation.response.generatedVideos[0].video,
      fileName,
      ai
    );

    console.log(`Video uploaded directly to storage:`, url);

    // Bug Fix: Removed unnecessary simulation delay after video upload
    // console.log('Simulating video generation...');
    // await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing time

    // Mock successful response
    const mockVideoResult = {
      videoUrl: url,
      thumbnailUrl: `https://example.com/generated-videos/thumbnail_${Date.now()}.jpg`,
      duration: actualDuration, // Use actual duration
      resolution: resolution,
      style: style,
      generatedAt: new Date().toISOString(),
      prompt: prompt,
    };

    console.log('Video generation completed:', mockVideoResult);
    return mockVideoResult;
  } catch (error) {
    console.error('Error generating video:', error);
    throw new Error(`Video generation failed: ${error.message}`);
  }
};

export const generateVideoWithVertexAI = async ({
  prompt,
  duration = 5, // Not directly used in the Vertex AI predictLongRunning call for Veo, but kept for consistency
  style = 'realistic', // Not directly used in the Vertex AI predictLongRunning call for Veo, but kept for consistency
  resolution = '1024x576', // Not directly used in the Vertex AI predictLongRunning call for Veo, but kept for consistency
}) => {
  const imageEndpoint = globalConfig.google.vertex_ai_endpoint;
  const location = globalConfig.google.vertex_ai_region;
  const modelId = 'veo-3.1-fast-generate-preview';
  const projectId = globalConfig.google.gcp_project_id;
  // Bug Fix: Use configurable GCS bucket name
  const gcsBucketName = globalConfig.google.gcs_bucket_name; // Ensure this is configured in globalConfig

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  console.log(`Using access token for endpoint: ${accessToken}`);

  const data = {
    instances: [
      {
        prompt: prompt,
      },
    ],
    parameters: {
      aspectRatio: '16:9', // Hardcoded, could be derived from resolution if needed
      sampleCount: 1,
      // Bug Fix: Use configurable GCS bucket name
      storageUri: `gs://${gcsBucketName}/`,
    },
  };
  console.log('Endpoint and request data:', {
    endpoint: `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`,
    data,
  });

  const response = await fetch(
    `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    }
  );
  if (!response.ok) {
    // Improve error logging to include response body
    const errorBody = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
  }

  const operation = await response.json();
  console.log('Received initial operation from Vertex AI:', operation);

  // Bug Fix: Return the operation name for polling, not the raw operation object
  // The caller (e.g., checkVideoGenerationStatus) will poll this operation name.
  return { operationName: operation.name };
};

export const getOperationStatus = async (operationName) => {
  const imageEndpoint = globalConfig.google.vertex_ai_endpoint;
  // const location = globalConfig.google.vertex_ai_region; // Not directly used in URL construction for operationName
  // const modelId = 'veo-3.1-fast-generate-preview'; // Not directly used in URL construction for operationName
  // const projectId = globalConfig.google.gcp_project_id; // Not directly used in URL construction for operationName

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  console.log(`Using access token for endpoint: ${accessToken}`);

  // Bug Fix: Correct endpoint for polling a Vertex AI operation.
  // The operationName is already a full resource path (e.g., projects/PROJECT_ID/locations/LOCATION/operations/OPERATION_ID).
  // We need to make a GET request to this resource URL.
  const operationUrl = `https://${imageEndpoint}/v1/${operationName}`;
  console.log(`Fetching operation status from: ${operationUrl}`);

  const response = await fetch(
    operationUrl, // Correct URL for polling
    {
      method: 'GET', // Bug Fix: Operations are polled with GET, not POST
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      // body: JSON.stringify({ operationName: operationName }), // Removed: No body for GET request
    }
  );
  if (!response.ok) {
    // Improve error logging to include response body
    const errorBody = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
  }
  const operationStatus = await response.json();
  console.log('Operation status from Vertex AI:', operationStatus);

  if (operationStatus.done && operationStatus.response) {
    // Bug Fix: Handle different response structures for video URIs
    const videoResult = operationStatus.response.generatedVideos?.[0]?.video || operationStatus.response.videos?.[0];
    if (videoResult?.uri || videoResult?.gcsUri) {
      const gcsUri = videoResult.uri || videoResult.gcsUri;
      const publicUrl = convertGcsUriToPublicUrl(gcsUri);
      operationStatus.response.videoUrl = publicUrl;
      console.log('Converted GCS URI to public URL:', publicUrl);
    }
  }
  return operationStatus;
};

const convertGcsUriToPublicUrl = (gcsUri) => {
  if (!gcsUri.startsWith('gs://')) {
    throw new Error('Invalid GCS URI');
  }
  const parts = gcsUri.replace('gs://', '').split('/');
  const bucketName = parts.shift();
  const filePath = parts.join('/');
  return `https://storage.googleapis.com/${bucketName}/${filePath}`;
};

const uploadFileToStorage = async (filePath) => {
  const storage = new Storage({
    projectId: globalConfig.google.gcp_project_id,
    // Security Fix: Removed hardcoded keyFilename. Rely on GOOGLE_APPLICATION_CREDENTIALS or default credentials.
    // keyFilename: 'alti_gcp.json',
  });
  const fileName = path.basename(filePath);
  // Bug Fix: Use configurable GCS bucket name
  const bucketName = globalConfig.google.gcs_bucket_name; // Ensure this is configured in globalConfig
  try {
    await storage.bucket(bucketName).upload(filePath, {
      destination: fileName,
      gzip: true,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });
    console.log(`✅ File uploaded: ${fileName}`);

    // Public URL (if bucket/file is public)
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log(`🌍 Public URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading file to storage:', error);
    throw new Error(`Failed to upload file to storage: ${error.message}`);
  }
};

/**
 * Upload video directly to Google Cloud Storage bucket without local save
 * @param {Object} videoFile - The video file object from Google GenAI
 * @param {string} fileName - The desired filename for the video
 * @param {Object} ai - The GoogleGenAI client instance
 * @returns {Promise<string>} - The public URL of the uploaded video
 */
const uploadVideoDirectlyToBucket = async (videoFile, fileName, ai) => {
  const storage = new Storage({
    projectId: globalConfig.google.gcp_project_id,
    // Security Fix: Removed hardcoded keyFilename. Rely on GOOGLE_APPLICATION_CREDENTIALS or default credentials.
    // keyFilename: 'alti_gcp.json',
  });
  // Bug Fix: Use configurable GCS bucket name
  const bucketName = globalConfig.google.gcs_bucket_name; // Ensure this is configured in globalConfig

  try {
    console.log(`Starting direct upload to bucket: ${bucketName}/${fileName}`);
    console.log('Video file object:', JSON.stringify(videoFile, null, 2));

    let videoBuffer;
    if (videoFile.uri) {
      // If the video file has a URI, fetch the content
      const response = await fetch(videoFile.uri);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch video from URI: ${response.statusText}`
        );
      }
      videoBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Alternative: try to download using the ai.files.download method to a buffer
      videoBuffer = await ai.files.downloadAsBuffer({ file: videoFile });
    }

    // Bug Fix: Refactored to avoid duplicated file.save logic
    // Create a file in the bucket and upload the buffer
    const file = storage.bucket(bucketName).file(fileName);
    await file.save(videoBuffer, {
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000',
      },
      resumable: false,
    });

    console.log(`✅ Video uploaded directly to bucket: ${fileName}`);

    // Public URL (if bucket/file is public)
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log(`🌍 Public URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading video directly to storage:', error);
    throw new Error(
      `Failed to upload video directly to storage: ${error.message}`
    );
  }
};

/**
 * Checks the status of a video generation job (for async video generation services)
 * @param {string} jobId - The job ID returned from the initial generation request (can be an operation name)
 * @returns {Promise<Object>} - Job status and result if completed
 */
export const checkVideoGenerationStatus = async (jobId) => {
  try {
    // If jobId represents a Vertex AI operation (contains 'projects/' or '/operations/')
    if (typeof jobId === 'string' && (jobId.includes('projects/') || jobId.includes('/operations/'))) {
      const operationStatus = await getOperationStatus(jobId);
      
      // Map to consistent format
      let status = 'processing';
      if (operationStatus.done) {
        status = operationStatus.error ? 'failed' : 'completed';
      }
      
      // Provide a more accurate progress if available in metadata
      const progress = operationStatus.done ? 100 : (operationStatus.metadata?.progressPercent || 50);

      return {
        id: jobId,
        status,
        progress,
        videoUrl: operationStatus.response?.videoUrl || null,
        error: operationStatus.error?.message || null,
        raw: operationStatus
      };
    }

    // Fallback/Mock implementation for non-Vertex AI jobs or if jobId format is different
    return {
      status: 'completed',
      videoUrl: `https://example.com/generated-videos/video_${jobId}.mp4`,
      progress: 100,
    };
  } catch (error) {
    console.error('Error checking video generation status:', error);
    throw new Error(
      `Failed to check video generation status: ${error.message}`
    );
  }
};

/**
 * Gets available video generation models/styles
 * @returns {Promise<Array>} - Array of available models and their capabilities
 */
export const getAvailableVideoModels = async () => {
  return [
    {
      id: 'veo-3.1-fast-generate-preview',
      name: 'Google Veo 3.1 Fast',
      description: 'Optimized fast high-quality video generation model',
      maxDuration: 8,
      resolutions: ['720p', '1024x576'],
    },
    {
      id: 'veo-3.1-generate-preview',
      name: 'Google Veo 3.1 Standard',
      description: 'Cinematic high-fidelity video generation model',
      maxDuration: 10,
      resolutions: ['720p', '1080p', '1920x1080'],
    },
    {
      id: 'cinematic',
      name: 'Cinematic',
      description: 'Movie-like cinematic video generation',
      maxDuration: 8,
      resolutions: ['1920x1080', '2560x1440'],
    },
  ];
};