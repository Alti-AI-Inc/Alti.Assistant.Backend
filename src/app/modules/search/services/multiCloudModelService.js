import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatBedrockConverse } from '@langchain/aws';
import config from '../../../../../config/index.js';
import { googleSearch, YouTubeSearchTool } from '../tools.js';
import {
  analyzeAndLogModelSelection,
} from '../utils/modelSelector.js';
import { logTenantUsage } from './marketplaceMeteringService.js';

/**
 * Enterprise Multi-Cloud Model Service
 * Dynamically instantiates and routes LLM requests across Google Cloud (Vertex AI/Gemini),
 * Azure OpenAI (Foundry/GPT-4o), and AWS Bedrock (Claude 3.5 Sonnet) based on environment configuration.
 * Automatically meters prompt and completion tokens asynchronously per provider.
 */

/**
 * Creates a standard LangChain Callback handler to log token usage events.
 */
function createBillingCallback(providerName) {
  return [
    {
      handleLLMEnd: async (output) => {
        try {
          const generations = output.generations?.[0] || [];
          let inputTokens = output.llmOutput?.tokenUsage?.promptTokens || 0;
          let outputTokens = output.llmOutput?.tokenUsage?.completionTokens || 0;
          
          if (inputTokens === 0 && outputTokens === 0) {
            // Fallback estimation (4 characters = 1 token average)
            const textContent = generations.map(g => g.text).join('');
            outputTokens = Math.round(textContent.length / 4);
            inputTokens = 120; // Estimated prompt context overhead
          }
          
          await logTenantUsage('alti-enterprise-tenant-default', providerName, {
            inputTokens,
            outputTokens,
            webSearchCount: 0, // Searches are logged in the search tool directly
          });
        } catch (err) {
          console.warn('⚠️ [Metering] Auto-callback logging failed:', err.message);
        }
      }
    }
  ];
}

// 1. Google Cloud Platform (Gemini) standard configurations
const gcpFlash = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
  callbacks: createBillingCallback('gcp'),
});

const gcpPro = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-pro',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
  callbacks: createBillingCallback('gcp'),
});

// 2. Azure and AWS model caches
let azureModel = null;
let awsModel = null;

/**
 * Resolves the active provider model instance based on configuration and requested complexity.
 * @param {string} complexity - 'simple' or 'complex'
 * @returns {Object} LangChain-compatible Chat Model instance
 */
function resolveActiveModelInstance(complexity = 'simple') {
  const provider = (config.llmProvider || 'gcp').toLowerCase();
  const primaryGcp = complexity === 'complex' ? gcpPro : gcpFlash;
  
  if (provider === 'azure') {
    if (!azureModel && config.azure && config.azure.apiKey && config.azure.endpoint) {
      try {
        azureModel = new AzureChatOpenAI({
          azureOpenAIApiKey: config.azure.apiKey,
          azureOpenAIApiInstanceName: new URL(config.azure.endpoint).hostname.split('.')[0],
          azureOpenAIApiDeploymentName: config.azure.deploymentOrModel,
          azureOpenAIApiVersion: config.azure.apiVersion,
          temperature: 0,
          maxRetries: 2,
          callbacks: createBillingCallback('azure'),
        });
        console.log(`☁️ Azure OpenAI / Foundry model instantiated: "${config.azure.deploymentOrModel}"`);
      } catch (err) {
        console.error('⚠️ Failed to instantiate Azure OpenAI model:', err.message);
      }
    }
    if (azureModel) {
      console.log('🔗 Configuring Azure OpenAI model with auto-failback to GCP');
      return azureModel.withFallbacks([primaryGcp]);
    }
  }
  
  if (provider === 'aws') {
    if (!awsModel && config.aws && config.aws.accessKeyId && config.aws.secretAccessKey) {
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
          callbacks: createBillingCallback('aws'),
        });
        console.log(`☁️ AWS Bedrock model instantiated: "${config.aws.modelId}"`);
      } catch (err) {
        console.error('⚠️ Failed to instantiate AWS Bedrock model:', err.message);
      }
    }
    if (awsModel) {
      console.log('🔗 Configuring AWS Bedrock model with auto-failback to GCP');
      return awsModel.withFallbacks([primaryGcp]);
    }
  }
  
  // Default and fallback: Google Cloud Platform (Gemini)
  return primaryGcp;
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
