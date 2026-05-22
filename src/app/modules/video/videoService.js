import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import globalConfig from '../../../../config/index.js';
import path from 'path';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';
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
    const ai = new GoogleGenAI({ apiKey: globalConfig.gemini_secret_key });
    let operation = await ai.models.generateVideos({
      model: 'veo-3.0-fast-generate-001',
      prompt: prompt,
      config: {
        durationSeconds: 8,
        resolution: '720p',
      },
    });

    // Poll the operation status until the video is ready.
    while (!operation.done) {
      console.log('Waiting for video generation to complete...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({
        operation: operation,
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

    console.log('Simulating video generation...');
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate processing time

    // Mock successful response
    const mockVideoResult = {
      videoUrl: url,
      thumbnailUrl: `https://example.com/generated-videos/thumbnail_${Date.now()}.jpg`,
      duration: duration,
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
  duration = 5,
  style = 'realistic',
  resolution = '1024x576',
}) => {
  const imageEndpoint = globalConfig.google.vertex_ai_endpoint;
  const location = globalConfig.google.vertex_ai_region;
  const modelId = 'veo-3.0-fast-generate-001';
  const projectId = globalConfig.google.gcp_project_id;
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
      aspectRatio: '16:9',
      sampleCount: 1,
      storageUri: 'gs://ai_video_alti/', // Your GCS bucket
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
    throw new Error(`HTTP error! status: ${JSON.stringify(response)}`);
  }

  const videoData = await response.json();
  // if (!videoData || !videoData.predictions || videoData.predictions.length === 0) {
  //   throw new Error('No predictions returned from Vertex AI.');
  // }
  // console.log('Received response from Vertex AI:', videoData.predictions);
  console.log('Received response from Vertex AI:', videoData);

  return videoData;
  // return videoData.predictions[0].bytesBase64Encoded
  //   ? `data:image/png;base64,${videoData.predictions[0].bytesBase64Encoded}`
  //   : null;
};

export const getOperationStatus = async (operationName) => {
  const imageEndpoint = globalConfig.google.vertex_ai_endpoint;
  const location = globalConfig.google.vertex_ai_region;
  const modelId = 'veo-3.0-fast-generate-001';
  const projectId = globalConfig.google.gcp_project_id;

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  console.log(`Using access token for endpoint: ${accessToken}`);

  const response = await fetch(
    `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:fetchPredictOperation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ operationName: operationName }),
    }
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${JSON.stringify(response)}`);
  }
  const operationStatus = await response.json();
  console.log('Operation status from Vertex AI:', operationStatus);
  if (operationStatus.done && operationStatus.response) {
    const videoUri = operationStatus.response.videos[0]?.gcsUri;
    if (videoUri) {
      const publicUrl = convertGcsUriToPublicUrl(videoUri);
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
    keyFilename: 'alti_gcp.json',
  });
  const fileName = path.basename(filePath);
  const bucketName = 'ai_video_alti';
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
    keyFilename: 'alti_gcp.json',
  });
  const bucketName = 'ai_video_alti';

  try {
    console.log(`Starting direct upload to bucket: ${bucketName}/${fileName}`);
    console.log('Video file object:', JSON.stringify(videoFile, null, 2));

    // The videoFile object should have a URI or other way to access the content
    // Let's try to download the video content using the video file object
    if (videoFile.uri) {
      // If the video file has a URI, fetch the content
      const response = await fetch(videoFile.uri);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch video from URI: ${response.statusText}`
        );
      }

      const videoBuffer = await response.buffer();

      // Create a file in the bucket and upload the buffer
      const file = storage.bucket(bucketName).file(fileName);
      await file.save(videoBuffer, {
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
    } else {
      // Alternative: try to download using the ai.files.download method to a buffer
      const videoBuffer = await ai.files.downloadAsBuffer({ file: videoFile });

      const file = storage.bucket(bucketName).file(fileName);
      await file.save(videoBuffer, {
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
    }

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
 * @param {string} jobId - The job ID returned from the initial generation request
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
      
      return {
        id: jobId,
        status,
        progress: operationStatus.done ? 100 : 50,
        videoUrl: operationStatus.response?.videoUrl || null,
        error: operationStatus.error?.message || null,
        raw: operationStatus
      };
    }

    // Fallback/Mock implementation
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
      id: 'veo-3.0-fast-generate-001',
      name: 'Google Veo 3.0 Fast',
      description: 'Optimized fast high-quality video generation model',
      maxDuration: 8,
      resolutions: ['720p', '1024x576'],
    },
    {
      id: 'veo-3.0-generate-001',
      name: 'Google Veo 3.0 Standard',
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
