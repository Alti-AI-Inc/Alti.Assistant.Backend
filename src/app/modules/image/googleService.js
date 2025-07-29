import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { predictionServiceClient } from './llm.js';

/**
 * Generates an image using Google's Imagen 3 model via Vertex AI.
 * @param {string} prompt - The final, detailed prompt for the image.
 * @returns {Promise<string|null>} - The URL of the generated image, or null on failure.
 */
export const generateImage = async (prompt) => {
  const endpoint = `projects/${config.gcpProjectId}/locations/${config.gcpLocation}/publishers/google/models/imagen-3.0-generate-002`;

  const instances = [{ prompt }];
  const parameters = {
    sampleCount: 1,
    aspectRatio: '1:1', // Or "16:9", "9:16", etc.
    outputFormat: 'png',
  };

  const request = {
    endpoint,
    instances,
    parameters,
  };

  try {
    console.log('Sending request to Vertex AI with prompt:', prompt);
    const [response] = await predictionServiceClient.predict(request);

    if (response.predictions && response.predictions.length > 0) {
      // The image data is base64 encoded
      const prediction = response.predictions[0];
      const imageBase64 = prediction.bytesBase64Encoded;
      return `data:image/png;base64,${imageBase64}`;
    } else {
      console.error('Vertex AI returned no predictions.');
      return null;
    }
  } catch (error) {
    console.error('Error generating image with Vertex AI:', error);
    return null;
  }
};

export const generateImageUsingVertexAI = async (prompt) => {
  const imageEndpoint = config.google.vertex_ai_endpoint;
  const location = config.google.vertex_ai_region;
  const modelId = config.google.model_id;
  const projectId = config.google.gcp_project_id;

  const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`;

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
      aspectRatio: '1:1',
      sampleCount: 1,
    },
  };
  console.log(
    'Endpoint:',
    `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-4.0-generate-preview-06-06:predict`
  );

  const response = await fetch(
    `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-4.0-generate-preview-06-06:predict`,
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

  const imageData = await response.json();
  if (!imageData || !imageData.predictions || imageData.predictions.length === 0) {
    throw new Error('No predictions returned from Vertex AI.');
  }
  console.log('Received response from Vertex AI:', data);
  return imageData.predictions[0].bytesBase64Encoded
    ? `data:image/png;base64,${imageData.predictions[0].bytesBase64Encoded}`
    : null;
};
