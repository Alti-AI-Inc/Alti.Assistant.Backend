import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { predictionServiceClient } from './llm.js';
// AI-FIX: Import services for usage tracking, workspace context, and custom errors.
import { checkImageGenerationLimit, recordUsage } from '../usage/usage.service.js';
import { WorkspaceService } from '../workspace/workspace.service.js';
import { QuotaExceededError, PermissionDeniedError } from '../../../shared/errors.js';

/**
 * Generates an image using Google's Imagen 3 model via Vertex AI using the Node.js client library.
 * @param {string} prompt - The final, detailed prompt for the image.
 * @param {object} user - The authenticated user object performing the action.
 * @param {string} user.id - The user's unique identifier.
 * @param {string} user.workspaceId - The ID of the workspace the user belongs to.
 * @param {string} user.role - The role of the user (e.g., 'user', 'manager', 'admin', 'super_admin').
 * @returns {Promise<string|null>} - The base64-encoded data URL of the generated image, or null on failure.
 * @throws {QuotaExceededError} If the workspace has exceeded its image generation limit.
 * @throws {PermissionDeniedError} If the user's role is not authorized to generate images.
 */
export const generateImage = async (prompt, user) => {
  // AI-FIX: Validate user context to ensure all actions are authorized and tracked within a tenant.
  if (!user || !user.id || !user.workspaceId || !user.role) {
    console.error('User context is missing or invalid for image generation.');
    // AI-FIX: Throw a specific error for permission issues that can be handled by the controller.
    throw new PermissionDeniedError('Invalid user context provided.');
  }

  // AI-FIX: Enforce role-based access control (RBAC).
  // This ensures only authorized roles can consume expensive resources.
  const allowedRoles = ['user', 'manager', 'admin', 'super_admin'];
  if (!allowedRoles.includes(user.role)) {
      throw new PermissionDeniedError(`User with role '${user.role}' is not authorized to generate images.`);
  }

  // AI-FIX: Check usage limits against the user's workspace before making the API call.
  // This prevents overuse, enforces subscription plans, and provides a better user experience.
  try {
    await checkImageGenerationLimit({ workspaceId: user.workspaceId, userId: user.id });
  } catch (error) {
    throw new QuotaExceededError('Image generation quota exceeded for this workspace.');
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    console.error('Invalid prompt provided for image generation.');
    return null;
  }

  const trimmedPrompt = prompt.trim().substring(0, 4000);

  try {
    // AI-FIX: Retrieve tenant-specific configuration from the workspace to ensure data isolation.
    // Fallback to global config if no workspace-specific settings are found.
    const workspace = await WorkspaceService.getById(user.workspaceId);
    const projectId = workspace?.gcpSettings?.projectId || config.gcpProjectId || (config.google && config.google.gcp_project_id);
    const location = workspace?.gcpSettings?.location || config.gcpLocation || (config.google && config.google.vertex_ai_region);
    const modelId = workspace?.gcpSettings?.imageModelId || config.google?.image_model_id || 'imagen-4.0-generate-002';

    if (!projectId || !location) {
      console.error(`GCP Project ID or Location is not configured for workspace ${user.workspaceId}.`);
      return null;
    }

    if (!predictionServiceClient || typeof predictionServiceClient.predict !== 'function') {
      console.error('Prediction service client is not initialized or unavailable.');
      return null;
    }

    // AI-FIX: Use the dynamically resolved modelId instead of a hardcoded value for better configurability.
    const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`;

    const instances = [{ prompt: trimmedPrompt }];
    const parameters = {
      sampleCount: 1,
      aspectRatio: '1:1',
      outputFormat: 'png',
    };

    const request = {
      endpoint,
      instances,
      parameters,
    };

    console.log(`[Workspace: ${user.workspaceId}] Sending request to Vertex AI with prompt:`, trimmedPrompt);
    const [response] = await predictionServiceClient.predict(request);

    if (response && response.predictions && response.predictions.length > 0) {
      const prediction = response.predictions[0];
      const imageBase64 = prediction.bytesBase64Encoded;
      if (!imageBase64) {
        console.error(`[Workspace: ${user.workspaceId}] Vertex AI prediction response did not contain bytesBase64Encoded data.`);
        return null;
      }
      
      // AI-FIX: Record successful usage to correctly decrement quotas and for billing purposes.
      // This propagates usage details up to the workspace/admin level.
      await recordUsage({ userId: user.id, workspaceId: user.workspaceId });

      return `data:image/png;base64,${imageBase64}`;
    } else {
      console.error(`[Workspace: ${user.workspaceId}] Vertex AI returned no predictions.`);
      return null;
    }
  } catch (error) {
    // AI-FIX: Differentiate between business logic errors (like quota) and system errors.
    // This allows the upstream controller to return appropriate HTTP status codes (e.g., 402/403 vs 500).
    if (error instanceof QuotaExceededError || error instanceof PermissionDeniedError) {
      throw error;
    }
    console.error(`[Workspace: ${user.workspaceId}] Error generating image with Vertex AI:`, error);
    return null;
  }
};

/**
 * Generates an image using Google's Imagen 3 model via Vertex AI using the REST API.
 * @param {string} prompt - The final, detailed prompt for the image.
 * @param {object} user - The authenticated user object performing the action.
 * @param {string} user.id - The user's unique identifier.
 * @param {string} user.workspaceId - The ID of the workspace the user belongs to.
 * @param {string} user.role - The role of the user (e.g., 'user', 'manager', 'admin', 'super_admin').
 * @returns {Promise<string|null>} - The base64-encoded data URL of the generated image, or null on failure.
 * @throws {QuotaExceededError} If the workspace has exceeded its image generation limit.
 * @throws {PermissionDeniedError} If the user's role is not authorized to generate images.
 */
export const generateImageUsingVertexAI = async (prompt, user) => {
  // AI-FIX: Validate user context to ensure all actions are authorized and tracked within a tenant.
  if (!user || !user.id || !user.workspaceId || !user.role) {
    console.error('User context is missing or invalid for image generation.');
    throw new PermissionDeniedError('Invalid user context provided.');
  }

  // AI-FIX: Enforce role-based access control (RBAC).
  const allowedRoles = ['user', 'manager', 'admin', 'super_admin'];
  if (!allowedRoles.includes(user.role)) {
      throw new PermissionDeniedError(`User with role '${user.role}' is not authorized to generate images.`);
  }

  // AI-FIX: Check usage limits against the user's workspace before making the API call.
  try {
    await checkImageGenerationLimit({ workspaceId: user.workspaceId, userId: user.id });
  } catch (error) {
    throw new QuotaExceededError('Image generation quota exceeded for this workspace.');
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    console.error('Invalid prompt provided for image generation.');
    return null;
  }

  const trimmedPrompt = prompt.trim().substring(0, 4000);

  try {
    // AI-FIX: Retrieve tenant-specific configuration from the workspace to ensure data isolation.
    const workspace = await WorkspaceService.getById(user.workspaceId);
    const imageEndpoint = workspace?.gcpSettings?.vertexAiEndpoint || (config.google && config.google.vertex_ai_endpoint) || 'us-central1-aiplatform.googleapis.com';
    const location = workspace?.gcpSettings?.location || (config.google && config.google.vertex_ai_region) || config.gcpLocation;
    const modelId = workspace?.gcpSettings?.imageModelId || (config.google && config.google.model_id) || 'imagen-4.0-generate-002';
    const projectId = workspace?.gcpSettings?.projectId || (config.google && config.google.gcp_project_id) || config.gcpProjectId;

    if (!projectId || !location) {
      console.error(`GCP Project ID or Location is not configured for workspace ${user.workspaceId} for Vertex AI HTTP API.`);
      return null;
    }

    const predictUrl = `https://${imageEndpoint}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`;

    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse ? accessTokenResponse.token : null;

    if (!accessToken) {
      console.error(`[Workspace: ${user.workspaceId}] Failed to retrieve GCP access token.`);
      return null;
    }

    const data = {
      instances: [{ prompt: trimmedPrompt }],
      parameters: { aspectRatio: '1:1', sampleCount: 1 },
    };

    console.log(`[Workspace: ${user.workspaceId}] Sending request to Vertex AI at:`, predictUrl);

    const response = await fetch(predictUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Workspace: ${user.workspaceId}] HTTP error! status: ${response.status}, body: ${errorBody}`);
      return null;
    }

    const imageData = await response.json();
    console.log(`[Workspace: ${user.workspaceId}] Received response from Vertex AI.`);

    if (!imageData || !imageData.predictions || imageData.predictions.length === 0) {
      console.error(`[Workspace: ${user.workspaceId}] No predictions returned from Vertex AI.`);
      return null;
    }

    const imageBase64 = imageData.predictions[0].bytesBase64Encoded;
    if (imageBase64) {
      // AI-FIX: Record successful usage to correctly decrement quotas and for billing purposes.
      await recordUsage({ userId: user.id, workspaceId: user.workspaceId });
      return `data:image/png;base64,${imageBase64}`;
    } else {
      console.error(`[Workspace: ${user.workspaceId}] Vertex AI prediction response did not contain bytesBase64Encoded data.`);
      return null;
    }
  } catch (error) {
    // AI-FIX: Differentiate between business logic errors (like quota) and system errors.
    if (error instanceof QuotaExceededError || error instanceof PermissionDeniedError) {
      throw error;
    }
    console.error(`[Workspace: ${user.workspaceId}] Error generating image with Vertex AI HTTP API:`, error);
    return null;
  }
};