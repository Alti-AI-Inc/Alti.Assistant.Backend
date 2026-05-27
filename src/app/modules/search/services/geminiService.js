import {
  selectModelSmart as mcSelectModelSmart,
  selectModel as mcSelectModel,
  createToolEnabledLLM as mcCreateToolEnabledLLM,
  createToolEnabledLLMExplicit as mcCreateToolEnabledLLMExplicit,
  gemini2_5Flash as mcGemini2_5Flash,
  gemini3ProPreview as mcGemini3ProPreview,
} from './multiCloudModelService.js';

/**
 * Gemini LLM Service Proxy
 * Proxies standard Gemini model instantiations and smart selectors to
 * the enterprise Multi-Cloud Model Service to achieve drop-in compatibility.
 */

// Model complexity constants
export const ModelComplexity = {
  SIMPLE: 'simple',
  COMPLEX: 'complex',
};

// Proxied base model instances
export const gemini2_5Flash = mcGemini2_5Flash;
export const gemini3ProPreview = mcGemini3ProPreview;

// Proxied smart routing selection and tooling methods
export const selectModelSmart = mcSelectModelSmart;
export const selectModel = mcSelectModel;
export const createToolEnabledLLM = mcCreateToolEnabledLLM;
export const createToolEnabledLLMExplicit = mcCreateToolEnabledLLMExplicit;

// Default LLM instances for legacy backward-compatibility
export const llm = gemini2_5Flash;
export const toolEnabledLLM = createToolEnabledLLM();

export default {
  ModelComplexity,
  gemini2_5Flash,
  gemini3ProPreview,
  selectModelSmart,
  selectModel,
  createToolEnabledLLM,
  createToolEnabledLLMExplicit,
  llm,
  toolEnabledLLM,
};
