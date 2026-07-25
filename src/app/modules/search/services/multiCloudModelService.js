import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// Enforce exclusive Google Cloud architecture for model execution
import config from '../../../../../config/index.js';
import { googleSearch, YouTubeSearchTool } from '../tools.js';
import {
  analyzeAndLogModelSelection,
} from '../utils/modelSelector.js';
import { logTenantUsage, checkTenantBudgetStatus, blockedTenantsCache } from './marketplaceMeteringService.js';

/**
 * A dummy LangChain model wrapper returned when a tenant's billing limit is exceeded.
 * Throws a BillingLimitExceeded error immediately on any execution invoke/stream.
 */
class BlockedBillingModel {
  // BUG FIX: Added tenantId to constructor to provide more context in error messages
  constructor(message, tenantId) {
    this.message = message;
    this.tenantId = tenantId;
  }

  bindTools() {
    return this;
  }

  withFallbacks() {
    return this;
  }

  async invoke() {
    // BUG FIX: Include tenantId in the error message for better debugging
    throw new Error(`${this.message} (Tenant: ${this.tenantId})`);
  }

  async *stream() {
    yield;
    // BUG FIX: Include tenantId in the error message for better debugging
    throw new Error(`${this.message} (Tenant: ${this.tenantId})`);
  }

  async invokeReader() {
    // BUG FIX: Include tenantId in the error message for better debugging
    throw new Error(`${this.message} (Tenant: ${this.tenantId})`);
  }
}

/**
 * Enterprise Multi-Cloud Model Service
 * Dynamically instantiates and routes LLM requests across Google Cloud (Vertex AI/Gemini),
 * Azure OpenAI (Foundry/GPT-4o), and AWS Bedrock (Claude 3.5 Sonnet) based on environment configuration.
 * Automatically meters prompt and completion tokens asynchronously per provider.
 */

/**
 * Creates a standard LangChain Callback handler to log token usage events for a specific tenant.
 * BUG FIX: Modified to accept tenantId, enabling multi-tenancy for billing.
 */
function createBillingCallbackHandler(tenantId, providerName) {
  return {
    handleLLMStart: async (llm, prompts) => {
      try {
        // BUG FIX: Use dynamic tenantId instead of hardcoded 'inso-enterprise-tenant-default'
        const budget = await checkTenantBudgetStatus(tenantId);
        if (budget.isBlocked) {
          throw new Error(`BillingLimitExceeded: Budget limit exceeded. Spend: ${budget.currentSpend.toFixed(2)}, Limit: ${budget.budgetLimit.toFixed(2)}`);
        }
      } catch (err) {
        if (err.message.includes('BillingLimitExceeded')) {
          throw err;
        }
        console.warn('⚠️ [Billing Check] Pre-flight budget check warning:', err.message);
      }
    },
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
        
        // BUG FIX: Use dynamic tenantId instead of hardcoded 'inso-enterprise-tenant-default'
        await logTenantUsage(tenantId, providerName, {
          inputTokens,
          outputTokens,
          webSearchCount: 0, // Searches are logged in the search tool directly
        });
      } catch (err) {
        console.warn('⚠️ [Metering] Auto-callback logging failed:', err.message);
      }
    }
  };
}

// 1. Google Cloud Platform (Gemini) standard configurations
// BUG FIX: Removed callbacks from global instances. Callbacks will be applied per-request via .withConfig().
const gcpFlash = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

const gcpPro = new ChatGoogleGenerativeAI({
  model: config.gemini_pro_model || 'gemini-3.1-pro',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

// 2. Azure and AWS model caches are deprecated.
const azureModel = null;
const awsModel = null;

/**
 * Resolves the active provider model instance based on configuration and requested complexity.
 * @param {string} tenantId - The ID of the current tenant.
 * @param {string} complexity - 'simple' or 'complex'
 * @returns {Object} LangChain-compatible Chat Model instance
 * BUG FIX: Added tenantId parameter to enable multi-tenancy.
 */
function resolveActiveModelInstance(tenantId, complexity = 'simple', tools = null) {
  // If tenant is blocked by budget limits, immediately resolve BlockedBillingModel
  // BUG FIX: Use dynamic tenantId instead of hardcoded 'inso-enterprise-tenant-default'
  if (blockedTenantsCache.has(tenantId)) {
    return new BlockedBillingModel('BillingLimitExceeded: Budget limit exceeded. Spend has reached or crossed the set threshold.', tenantId);
  }

  const provider = (config.llmProvider || 'gcp').toLowerCase();
  let primaryGcp = complexity === 'complex' ? gcpPro : gcpFlash;
  
  if (provider !== 'gcp') {
    console.warn(`☁️ [Multi-Cloud Deprecation] Non-GCP provider "${provider}" configuration bypassed. Exclusively routing model execution to Google Cloud (Gemini).`);
  }
  
  if (tools) {
    primaryGcp = primaryGcp.bindTools(tools);
  }
  
  // Exclusively return Google Cloud Platform (Gemini)
  // BUG FIX: Apply tenant-specific callbacks and metadata using .withConfig()
  return primaryGcp.withConfig({
    callbacks: [createBillingCallbackHandler(tenantId, 'gcp')],
    metadata: { tenantId } // Attach tenantId to metadata for potential downstream use
  });
}

/**
 * SMART MODEL SELECTION - Automatically determines the best model based on query analysis
 * @param {string} query - The user query
 * @param {Object} context - Additional context for analysis
 * @param {string} tenantId - The ID of the current tenant.
 * @returns {Object} The optimal Chat Model instance
 * BUG FIX: Added tenantId parameter to enable multi-tenancy.
 */
export function selectModelSmart(query, context = {}, tenantId, tools = null) {
  const analysis = analyzeAndLogModelSelection(query, context);
  console.log(`🧠 Multi-Cloud Selection: Provider: "${config.llmProvider || 'gcp'}" | Pro requested: ${analysis.usePro}`);
  
  // BUG FIX: Pass tenantId to resolveActiveModelInstance
  return resolveActiveModelInstance(tenantId, analysis.usePro ? 'complex' : 'simple', tools);
}

/**
 * Determine which model to use based on manual task characteristics
 * @param {Object} options - Task characteristics
 * @param {string} tenantId - The ID of the current tenant.
 * @returns {Object} The appropriate Chat Model instance
 * BUG FIX: Added tenantId parameter to enable multi-tenancy.
 */
export function selectModel(options = {}, tenantId, tools = null) {
  const {
    complexity = 'simple',
    inputLength = 0,
    requiresReasoning = false,
    speedPriority = false,
    query = null,
    context = {},
  } = options;

  if (query) {
    // BUG FIX: Pass tenantId to selectModelSmart
    return selectModelSmart(query, {
      ...context,
      requiresReasoning,
      inputLength,
    }, tenantId, tools);
  }

  if (complexity === 'complex' || requiresReasoning || inputLength > 10000) {
    // BUG FIX: Pass tenantId to resolveActiveModelInstance
    return resolveActiveModelInstance(tenantId, 'complex', tools);
  }

  // BUG FIX: Pass tenantId to resolveActiveModelInstance
  return resolveActiveModelInstance(tenantId, 'simple', tools);
}

/**
 * Create tool-enabled LLM with search capabilities
 * @param {string} query - The user query for smart model selection
 * @param {Object} options - Model selection options and context
 * @param {string} tenantId - The ID of the current tenant.
 * @returns {Object} Tool-enabled Chat Model instance
 * BUG FIX: Added tenantId parameter to enable multi-tenancy.
 */
export function createToolEnabledLLM(query = null, options = {}, tenantId) {
  const searchTools = [new YouTubeSearchTool(), googleSearch];
  // BUG FIX: Pass tenantId to selectModel
  const model = selectModel({ query, ...options }, tenantId, searchTools);
  
  return model;
}

/**
 * Create tool-enabled LLM with explicit model choice
 * @param {string} modelType - 'flash' or 'pro'
 * @param {string} tenantId - The ID of the current tenant.
 * @returns {Object} Tool-enabled Chat Model instance
 * BUG FIX: Added tenantId parameter to enable multi-tenancy.
 */
export function createToolEnabledLLMExplicit(modelType = 'flash', tenantId) {
  const searchTools = [new YouTubeSearchTool(), googleSearch];
  // BUG FIX: Pass tenantId to resolveActiveModelInstance
  const model = resolveActiveModelInstance(tenantId, modelType === 'pro' ? 'complex' : 'simple', searchTools);
  
  return model;
}

// Export default instances for backward compatibility mapping
export const gemini2_5Flash = gcpFlash; // These are raw models, without tenant-specific callbacks
export const gemini3ProPreview = gcpPro; // These are raw models, without tenant-specific callbacks

// BUG FIX: Changed active models to functions that take tenantId, as they require tenant context for billing.
export const getActiveFlashModel = (tenantId) => resolveActiveModelInstance(tenantId, 'simple');
export const getActiveProModel = (tenantId) => resolveActiveModelInstance(tenantId, 'complex');

export default {
  selectModelSmart,
  selectModel,
  createToolEnabledLLM,
  createToolEnabledLLMExplicit,
  gemini2_5Flash,
  gemini3ProPreview,
  // BUG FIX: Export functions for active models to ensure tenant context is provided
  getActiveFlashModel,
  getActiveProModel,
};