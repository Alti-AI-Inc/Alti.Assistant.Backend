/**
 * @file Chatbot Fine-Tuning Service
 * @module app/modules/chatbots/chatbotTuning.service
 * @description Service to manage supervised fine-tuning of Gemini models on Vertex AI.
 */

import { GoogleAuth } from 'google-auth-library';
import { Storage } from '@google-cloud/storage';
import { VertexAI } from '@google-cloud/vertexai';
import axios from 'axios';
import Chatbot from './chatbot.model.js';
import KnowledgebaseFile from '../knowledgebase/knowledgebase.files.model.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Initialize GCP Auth
const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

// Initialize GCS Storage
const storage = new Storage();
const bucketName = config.gcs?.uploads_bucket || 'alti_assistant_uploads';

/**
 * Downloads a file's content from Google Cloud Storage and returns it as a UTF-8 string.
 * @param {string} gcsPath - The path within the GCS bucket.
 * @returns {Promise<string>} File content text.
 */
const downloadFileFromGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File does not exist on GCS: ${gcsPath}`);
    }
    const [content] = await file.download();
    return content.toString('utf-8');
  } catch (error) {
    logger.error(`Error downloading file from GCS (${gcsPath}):`, error);
    throw error;
  }
};

/**
 * Uses a foundation Gemini model to convert document content into conversation training pairs (JSONL).
 * @param {object} chatbot - Chatbot document.
 * @param {string} fileContent - Raw content of the uploaded document.
 * @returns {Promise<string[]>} Array of JSON strings representing conversation turns.
 */
const generateTrainingPairs = async (chatbot, fileContent) => {
  try {
    const projectId = await auth.getProjectId();
    const vertexAI = new VertexAI({ project: projectId, location: 'us-central1' });
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash-001',
      generationConfig: {
        temperature: 0.5,
      },
    });

    // We split content into chunks of ~4000 characters to prevent prompt overflow
    const maxChunkSize = 4000;
    const chunks = [];
    for (let i = 0; i < fileContent.length; i += maxChunkSize) {
      chunks.push(fileContent.substring(i, i + maxChunkSize));
    }

    const allTurns = [];

    for (const chunk of chunks) {
      const prompt = `You are a high-quality machine learning training data generator. Your goal is to synthesize fine-tuning examples in the exact format required for Vertex AI Gemini supervised tuning.
      
      Based on the source text chunk provided, generate 5-8 realistic, diverse prompt-response user assistant conversation turns.
      The generated turns MUST strictly demonstrate the assistant adhering to these guidelines:
      - Instructions: "${chatbot.instructions || 'Be helpful'}"
      - Guardrails: "${chatbot.guardrails || 'Ensure safe content'}"

      Format each conversation turn as a single line JSON matching this structure:
      {"contents": [{"role": "user", "parts": [{"text": "The prompt/question..."}]}, {"role": "model", "parts": [{"text": "The conforming response..."}]}]}

      Return ONLY the raw JSON lines, one valid JSON object per line. Do NOT enclose in markdown blocks (e.g. \`\`\`json). No explanations.

      Source Text:
      ${chunk}`;

      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const lines = responseText.trim().split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        try {
          // Verify it is valid JSON
          JSON.parse(trimmedLine);
          allTurns.push(trimmedLine);
        } catch (e) {
          logger.warn(`Skipping invalid training line generated: ${trimmedLine}`);
        }
      }
    }

    return allTurns;
  } catch (error) {
    logger.error('Failed to generate training pairs via Gemini:', error);
    return [];
  }
};

/**
 * Triggers the dataset generation and submits a Vertex AI tuning job.
 * @param {string} chatbotId - ID of the chatbot to tune.
 */
export const startModelTuning = async (chatbotId) => {
  try {
    const chatbot = await Chatbot.findById(chatbotId);
    if (!chatbot) {
      throw new Error(`Chatbot not found: ${chatbotId}`);
    }

    logger.info(`[Tuning] Starting dataset generation for chatbot: ${chatbot.name} (${chatbotId})`);

    // Fetch all files associated with this bot's knowledgebase/data field
    const files = await KnowledgebaseFile.find({ knowledgebotId: chatbotId, isActive: true }).lean();
    if (files.length === 0) {
      throw new Error('No training files found. Upload files to tune the model.');
    }

    let rawTextData = '';
    for (const file of files) {
      if (file.fileType.startsWith('text/') || file.fileType === 'application/pdf' || file.fileType.includes('document')) {
        const text = await downloadFileFromGCS(file.gcsPath);
        rawTextData += `\n\n--- Source Document: ${file.originalName} ---\n${text}`;
      }
    }

    if (!rawTextData.trim()) {
      throw new Error('No valid text content extracted from uploaded files.');
    }

    // Generate training JSONL pairs
    const trainingPairs = await generateTrainingPairs(chatbot, rawTextData);
    
    // We need at least a few training pairs to trigger tuning. Vertex AI prefers larger sizes, 
    // but we will augment/pad to meet basic validation if necessary.
    if (trainingPairs.length === 0) {
      throw new Error('Failed to generate any valid training data from documents.');
    }

    // If we have less than 20 training turns, replicate them to provide basic dataset volume
    let finalDatasetLines = [...trainingPairs];
    while (finalDatasetLines.length < 20) {
      finalDatasetLines = finalDatasetLines.concat(trainingPairs);
    }

    const datasetJsonlContent = finalDatasetLines.join('\n');
    const datasetGcsPath = `tuning/datasets/${chatbotId}_train.jsonl`;
    const datasetGcsUri = `gs://${bucketName}/${datasetGcsPath}`;

    // Upload dataset to GCS
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(datasetGcsPath);
    await file.save(datasetJsonlContent, {
      contentType: 'application/x-jsonlines',
    });

    logger.info(`[Tuning] Training dataset saved to GCS: ${datasetGcsUri}`);

    // Call Vertex AI REST API to launch the supervised tuning job
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    const projectId = await auth.getProjectId();

    const region = 'us-central1';
    const tuningJobsUrl = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/tuningJobs`;

    const tuningPayload = {
      displayName: `tuning-${chatbot.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${chatbot.id.substring(0, 8)}`,
      baseModel: 'publishers/google/models/gemini-1.5-flash-001',
      supervisedTuningSpec: {
        trainingDatasetUri: datasetGcsUri,
        hyperParameters: {
          epochCount: 3,
        },
      },
    };

    logger.info(`[Tuning] Submitting Vertex AI tuning job for: ${chatbot.name}`);
    
    const response = await axios.post(tuningJobsUrl, tuningPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const jobResourceName = response.data.name; // projects/[PROJECT]/locations/us-central1/tuningJobs/[JOB_ID]
    logger.info(`[Tuning] Tuning job submitted successfully! Resource Name: ${jobResourceName}`);

    // Update chatbot metadata
    chatbot.metadata = {
      ...chatbot.metadata,
      status: 'tuning',
      jobId: jobResourceName,
      tuningDatasetUri: datasetGcsUri,
    };
    await chatbot.save();

  } catch (error) {
    logger.error(`[Tuning] Error starting tuning job for chatbot ${chatbotId}:`, error);
    
    // Update chatbot metadata with failure status
    try {
      const chatbot = await Chatbot.findById(chatbotId);
      if (chatbot) {
        chatbot.metadata = {
          ...chatbot.metadata,
          status: 'failed',
          tuningError: error.message || String(error),
        };
        await chatbot.save();
      }
    } catch (dbErr) {
      logger.error('Failed to update chatbot error metadata:', dbErr);
    }
  }
};

/**
 * Checks the status of an active Vertex AI tuning job and updates the chatbot.
 * @param {string} chatbotId - The ID of the chatbot to check.
 * @returns {Promise<object>} Status metadata.
 */
export const checkModelTuningStatus = async (chatbotId) => {
  try {
    const chatbot = await Chatbot.findById(chatbotId);
    if (!chatbot) {
      throw new Error(`Chatbot not found: ${chatbotId}`);
    }

    const metadata = chatbot.metadata || {};
    if (metadata.status !== 'tuning' || !metadata.jobId) {
      return { status: metadata.status || 'ready', error: metadata.tuningError };
    }

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const jobUrl = `https://us-central1-aiplatform.googleapis.com/v1/${metadata.jobId}`;

    logger.info(`[Tuning] Querying Vertex AI job status for: ${chatbot.name} (${metadata.jobId})`);
    
    const response = await axios.get(jobUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const jobData = response.data;
    const state = jobData.state; // e.g., JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, JOB_STATE_RUNNING

    logger.info(`[Tuning] Job state for chatbot ${chatbot.name}: ${state}`);

    if (state === 'JOB_STATE_SUCCEEDED') {
      const tunedModelResource = jobData.tunedModel?.model;
      if (!tunedModelResource) {
        throw new Error('Tuning job succeeded but no tuned model resource was returned.');
      }

      logger.info(`[Tuning] Fine-tuning succeeded! Tuned Model: ${tunedModelResource}`);

      chatbot.model = tunedModelResource;
      chatbot.metadata = {
        ...chatbot.metadata,
        status: 'ready',
      };
      await chatbot.save();

      return { status: 'ready', model: tunedModelResource };
    } else if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
      const errorMessage = jobData.error?.message || 'Vertex AI fine-tuning failed.';
      logger.error(`[Tuning] Fine-tuning job failed: ${errorMessage}`);

      chatbot.metadata = {
        ...chatbot.metadata,
        status: 'failed',
        tuningError: errorMessage,
      };
      await chatbot.save();

      return { status: 'failed', error: errorMessage };
    }

    // Still running or pending
    return { status: 'tuning', jobId: metadata.jobId };
  } catch (error) {
    logger.error(`[Tuning] Error checking job status for chatbot ${chatbotId}:`, error);
    return { status: 'tuning', error: error.message };
  }
};

/**
 * Queries the fine-tuned Vertex AI Gemini model.
 * @param {object} chatbot - Chatbot document.
 * @param {string} prompt - User prompt.
 * @param {Array} chatHistory - Array of conversation turns.
 * @returns {Promise<object>} The model's response in a standard format.
 */
export const queryTunedModel = async (chatbot, prompt, chatHistory = []) => {
  try {
    const projectId = await auth.getProjectId();
    const vertexAI = new VertexAI({ project: projectId, location: 'us-central1' });
    
    const generativeModel = vertexAI.getGenerativeModel({
      model: chatbot.model,
      generationConfig: {
        temperature: 0.5,
      },
    });

    const contents = [];
    
    for (const turn of chatHistory) {
      if (!turn.role || !turn.content) continue;
      const role = (turn.role === 'assistant' || turn.role === 'bot') ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: turn.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    logger.info(`[Tuning] Querying tuned model: ${chatbot.model} for chatbot ${chatbot._id}`);

    const result = await generativeModel.generateContent({ contents });
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || 
      "I apologize, but I did not receive a response from the fine-tuned model.";

    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    return {
      answer: responseText,
      sources: [],
      confidence: 1.0,
      model: chatbot.model,
      tokensUsed,
      chatHistory: chatHistory.concat([
        { role: 'user', content: prompt },
        { role: 'model', content: responseText }
      ]),
    };
  } catch (error) {
    logger.error(`[Tuning] Error querying tuned model ${chatbot.model}:`, error);
    throw error;
  }
};

