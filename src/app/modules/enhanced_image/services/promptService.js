import {
  evaluatePromptQuality,
  buildEnhancedPrompt,
} from '../utils/promptEvaluator.js';

export class PromptService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async evaluatePrompt(prompt, history) {
    return await evaluatePromptQuality(prompt, history, {
      apiKey: this.apiKey,
    });
  }

  async buildEnhancedPrompt(conversationHistory) {
    return await buildEnhancedPrompt(conversationHistory, {
      apiKey: this.apiKey,
    });
  }
}
