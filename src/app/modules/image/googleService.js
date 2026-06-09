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
  // Ensure all operations are wrapped in a try-catch for robust error handling
  try {
    const imageEndpoint = config.google.vertex_ai_endpoint;
    const location = config.google.vertex_ai_region;
    const modelId = config.google.model_id; // Use this model ID consistently
    const projectId = config.google.gcp_project_id;

    // Construct the full endpoint URL for the prediction API
    // Bug fix: Use the modelId from config instead of a hardcoded value
    const predictUrl = `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`;

    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    // Security fix: Do not log sensitive access tokens
    // console.log(`Using access token for endpoint: ${accessToken}`);

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

    // Bug fix: Log the dynamically constructed predictUrl
    console.log('Sending request to Vertex AI at:', predictUrl);

    const response = await fetch(predictUrl, { // Bug fix: Use the dynamically constructed predictUrl
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Bug fix: Log the full error response for better debugging and return null
      const errorBody = await response.text(); // Get text to avoid JSON parsing errors on non-JSON responses
      console.error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      return null; // Return null on failure, consistent with generateImage
    }

    const imageData = await response.json();
    // Bug fix: Log the actual response data, not the request data
    console.log('Received response from Vertex AI:', imageData);

    if (
      !imageData ||
      !imageData.predictions ||
      imageData.predictions.length === 0
    ) {
      console.error('No predictions returned from Vertex AI.');
      return null; // Return null on failure
    }

    return imageData.predictions[0].bytesBase64Encoded
      ? `data:image/png;base64,${imageData.predictions[0].bytesBase64Encoded}`
      : null;
  } catch (error) {
    // Bug fix: Catch any errors during the process and return null
    console.error('Error generating image with Vertex AI HTTP API:', error);
    return null;
  }
};