import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatBedrockConverse } from '@langchain/aws';
import config from '../../../../../config/index.js';
import { googleSearch, YouTubeSearchTool } from '../tools.js';
import {
  analyzeAndLogModelSelection,
} from '../utils/modelSelector.js';

/**
 * Enterprise Multi-Cloud Model Service
 * Dynamically instantiates and routes LLM requests across Google Cloud (Vertex AI/Gemini),
 * Azure OpenAI (Foundry/GPT-4o), and AWS Bedrock (Claude 3.5 Sonnet) based on environment configuration.
 */

// 1. Google Cloud Platform (Gemini) standard configurations
const gcpFlash = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

const gcpPro = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-pro',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

// 2. Azure OpenAI / Foundry configurations (fail-safe)
let azureModel = null;
if (config.azure && config.azure.apiKey && config.azure.endpoint) {
  try {
    azureModel = new AzureChatOpenAI({
      azureOpenAIApiKey: config.azure.apiKey,
      azureOpenAIApiInstanceName: new URL(config.azure.endpoint).hostname.split('.')[0],
      azureOpenAIApiDeploymentName: config.azure.deploymentOrModel,
      azureOpenAIApiVersion: config.azure.apiVersion,
      temperature: 0,
      maxRetries: 2,
    });
    console.log(`☁️ Azure OpenAI / Foundry model configured: "${config.azure.deploymentOrModel}"`);
  } catch (err) {
    console.error('⚠️ Failed to instantiate Azure OpenAI model, defaulting to GCP fallback:', err.message);
  }
}

// 3. AWS Bedrock configurations (fail-safe)
let awsModel = null;
if (config.aws && config.aws.accessKeyId && config.aws.secretAccessKey) {
  try {
    awsModel = new ChatBedrockConverse({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
      model: config.aws.modelId,
      temperature: 0,
      maxRetries: 2,
    });
    console.log(`☁️ AWS Bedrock model configured: "${config.aws.modelId}"`);
  } catch (err) {
    console.error('⚠️ Failed to instantiate AWS Bedrock model, defaulting to GCP fallback:', err.message);
  }
}

/**
 * Resolves the active provider model instance based on configuration and requested complexity.
 * @param {string} complexity - 'simple' or 'complex'
 * @returns {Object} LangChain-compatible Chat Model instance
 */
function resolveActiveModelInstance(complexity = 'simple') {
  const provider = (config.llmProvider || 'gcp').toLowerCase();
  
  if (provider === 'azure' && azureModel) {
    return azureModel;
  }
  
  if (provider === 'aws' && awsModel) {
    return awsModel;
  }
  
  // Default and fallback: Google Cloud Platform (Gemini)
  if (complexity === 'complex') {
    return gcpPro;
  }
  return gcpFlash;
}

/**
 * SMART MODEL SELECTION - Automatically determines the best model based on query analysis
 * @param {string} query - The user query
 * @param {Object} context - Additional context for analysis
 * @returns {Object} The optimal Chat Model instance
 */
export function selectModelSmart(query, context = {}) {
  const analysis = analyzeAndLogModelSelection(query, context);
  console.log(`🧠 Multi-Cloud Selection: Provider: "${config.llmProvider || 'gcp'}" | Pro requested: ${analysis.usePro}`);
  
  return resolveActiveModelInstance(analysis.usePro ? 'complex' : 'simple');
}

/**
 * Determine which model to use based on manual task characteristics
 * @param {Object} options - Task characteristics
 * @returns {Object} The appropriate Chat Model instance
 */
export function selectModel(options = {}) {
  const {
    complexity = 'simple',
    inputLength = 0,
    requiresReasoning = false,
    speedPriority = false,
    query = null,
    context = {},
  } = options;

  if (query) {
    return selectModelSmart(query, {
      ...context,
      requiresReasoning,
      inputLength,
    });
  }

  if (complexity === 'complex' || requiresReasoning || inputLength > 10000) {
    return resolveActiveModelInstance('complex');
  }

  return resolveActiveModelInstance('simple');
}

/**
 * Create tool-enabled LLM with search capabilities
 * @param {string} query - The user query for smart model selection
 * @param {Object} options - Model selection options and context
 * @returns {Object} Tool-enabled Chat Model instance
 */
export function createToolEnabledLLM(query = null, options = {}) {
  const searchTools = [new YouTubeSearchTool(), googleSearch];
  const model = selectModel({ query, ...options });
  
  return model.bindTools(searchTools);
}

/**
 * Create tool-enabled LLM with explicit model choice
 * @param {string} modelType - 'flash' or 'pro'
 * @returns {Object} Tool-enabled Chat Model instance
 */
export function createToolEnabledLLMExplicit(modelType = 'flash') {
  const searchTools = [new YouTubeSearchTool(), googleSearch];
  const model = resolveActiveModelInstance(modelType === 'pro' ? 'complex' : 'simple');
  
  return model.bindTools(searchTools);
}

// Export default instances for backward compatibility mapping
export const gemini2_5Flash = gcpFlash;
export const gemini3ProPreview = gcpPro;
export const activeFlashModel = resolveActiveModelInstance('simple');
export const activeProModel = resolveActiveModelInstance('complex');

export default {
  selectModelSmart,
  selectModel,
  createToolEnabledLLM,
  createToolEnabledLLMExplicit,
  gemini2_5Flash,
  gemini3ProPreview,
  activeFlashModel,
  activeProModel,
};
