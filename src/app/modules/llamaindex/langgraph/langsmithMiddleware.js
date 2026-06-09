import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
// Assuming LangChainTracer is available from @langchain/core for LangSmith integration.
// This import path might need adjustment based on the actual project setup and LangChain version.
import { LangChainTracer } from '@langchain/core/tracers/langchain';

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
    // Return standard tracing configurations.
    // The LangChainTracer automatically picks up environment variables like LANGCHAIN_PROJECT,
    // LANGCHAIN_API_KEY, LANGCHAIN_ENDPOINT, and LANGCHAIN_TRACING_V2.
    // The `runName` parameter is typically used when invoking a runnable, not directly in the tracer's constructor
    // for the overall trace setup.
    return [new LangChainTracer()];
  }
}

export const langsmithMiddleware = new LangsmithMiddleware();
langsmithMiddleware.logDiagnostics();