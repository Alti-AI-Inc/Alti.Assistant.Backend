import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
// Assuming LangChainTracer is available from @langchain/core for LangSmith integration.
// This import path might need adjustment based on the actual project setup and LangChain version.
import { LangChainTracer } from '@langchain/core/tracers/langchain';

/**
 * @class LangsmithMiddleware
 * @description
 * Manages LangSmith tracing configuration and provides utilities for integrating
 * LangSmith with LangChain runnables in the application. It reads configuration
 * from environment variables or the application's config file.
 */
class LangsmithMiddleware {
  /**
   * @private
   * @type {boolean}
   * @description Indicates whether LangSmith tracing is active.
   */
  tracingActive;

  /**
   * @private
   * @type {string|undefined}
   * @description The API key for LangSmith.
   */
  apiKey;

  /**
   * @private
   * @type {string}
   * @description The project name to use for LangSmith traces.
   */
  projectName;

  /**
   * @private
   * @type {string}
   * @description The endpoint URL for the LangSmith API.
   */
  endpoint;

  /**
   * @constructor
   * @description
   * Initializes the LangsmithMiddleware instance by loading LangSmith configuration
   * from environment variables (`process.env`) or the application's `config` object.
   * It sets `tracingActive`, `apiKey`, `projectName`, and `endpoint`.
   */
  constructor() {
    this.tracingActive = process.env.LANGCHAIN_TRACING_V2 === 'true' || config.langchain?.tracingActive === 'true';
    this.apiKey = process.env.LANGCHAIN_API_KEY || config.langchain?.apiKey;
    this.projectName = process.env.LANGCHAIN_PROJECT || config.langchain?.project || 'Alti-Assistant-RAG';
    this.endpoint = process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';
  }

  /**
   * @method getTracingEnv
   * @description
   * Returns a configuration object suitable for setting environment variables
   * for LangChain clients to enable LangSmith tracing.
   * This method checks if tracing is active and an API key is provided.
   * @returns {object} An object containing LangSmith environment variables if tracing is active,
   *                   otherwise an empty object.
   * @property {string} [LANGCHAIN_TRACING_V2='true'] - Indicates LangChain tracing V2 is enabled.
   * @property {string} [LANGCHAIN_API_KEY] - The LangSmith API key.
   * @property {string} [LANGCHAIN_PROJECT] - The LangSmith project name.
   * @property {string} [LANGCHAIN_ENDPOINT] - The LangSmith API endpoint.
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
   * @method logDiagnostics
   * @description
   * Logs the current status of LangSmith tracing to the console for diagnostic purposes.
   * It informs whether tracing is active and which project space is being used,
   * or provides instructions on how to activate it if inactive.
   * @returns {void}
   */
  logDiagnostics() {
    if (this.tracingActive && this.apiKey) {
      logger.info(`[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "${this.projectName}"`);
    } else {
      logger.info('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
    }
  }

  /**
   * @method getTraceCallbacks
   * @description
   * Provides an array of LangChain callback handlers configured for LangSmith tracing.
   * If tracing is not active or an API key is missing, an empty array is returned.
   * The `LangChainTracer` automatically picks up environment variables for configuration.
   * @param {string} [runName='Agentic-RAG-Execution'] - A descriptive name for the LangChain run.
   *                                                     Note: This parameter is typically used when invoking a runnable,
   *                                                     not directly in the tracer's constructor for overall setup.
   * @returns {Array<LangChainTracer>} An array containing a `LangChainTracer` instance if tracing is active,
   *                                   otherwise an empty array.
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

/**
 * @constant {LangsmithMiddleware} langsmithMiddleware
 * @description
 * An exported singleton instance of the `LangsmithMiddleware` class.
 * This instance is initialized upon import and logs its diagnostic status.
 * It provides methods to retrieve LangSmith tracing configurations and callback handlers.
 */
export const langsmithMiddleware = new LangsmithMiddleware();
langsmithMiddleware.logDiagnostics();