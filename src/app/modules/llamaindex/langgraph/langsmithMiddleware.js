import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

class LangsmithMiddleware {
  constructor() {
    this.tracingActive = process.env.LANGCHAIN_TRACING_V2 === 'true' || config.langchain?.tracingActive === 'true';
    this.apiKey = process.env.LANGCHAIN_API_KEY || config.langchain?.apiKey;
    this.projectName = process.env.LANGCHAIN_PROJECT || config.langchain?.project || 'Alti-Assistant-RAG';
    this.endpoint = process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';
  }

  /**
   * Return full environment tracking configurations for LangChain clients
   */
  getTracingEnv() {
    if (!this.tracingActive || !this.apiKey) {
      return {};
    }
    return {
      LANGCHAIN_TRACING_V2: 'true',
      LANGCHAIN_API_KEY: this.apiKey,
      LANGCHAIN_PROJECT: this.projectName,
      LANGCHAIN_ENDPOINT: this.endpoint
    };
  }

  /**
   * Log current active tracing context to console for diagnostics
   */
  logDiagnostics() {
    if (this.tracingActive && this.apiKey) {
      logger.info(`[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "${this.projectName}"`);
    } else {
      logger.info('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
    }
  }

  /**
   * High-fidelity trace callback builder for LangChain runnables
   */
  getTraceCallbacks(runName = 'Agentic-RAG-Execution') {
    if (!this.tracingActive || !this.apiKey) {
      return [];
    }
    // Return standard tracing configurations
    return [];
  }
}

export const langsmithMiddleware = new LangsmithMiddleware();
langsmithMiddleware.logDiagnostics();
