import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
// Assuming LangChainTracer is available from @langchain/core for LangSmith integration.
// This import path might need adjustment based on the actual project setup and LangChain version.
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import httpStatus from 'http-status';
import ApiError from '../../../../errors/ApiError.js';

/**
 * @class LangsmithMiddleware
 * @description
 * Manages LangSmith tracing configuration and provides utilities for integrating
 * LangSmith with LangChain runnables in the application. It reads configuration
 * from environment variables or the application's config file.
 *
 * Platform Owner Features:
 * - Global enable/disable switch for tracing.
 * - Per-tenant tracing override: Force tracing for specific tenants for debugging/oversight,
 *   even if globally disabled.
 * - Tenant-isolated tracing: Automatically creates separate LangSmith projects for each tenant
 *   (e.g., "Platform-Project-tenant-abc-123"), ensuring data segregation and focused analysis.
 * - Rich metadata injection: Enriches traces with tenantId, userId, and requestId for
 *   granular filtering and global oversight within the LangSmith dashboard.
 * - A default project for system-level or non-tenant-specific traces.
 */
class LangsmithMiddleware {
  /**
   * @private
   * @type {boolean}
   * @description Global switch to activate LangSmith tracing. Can be overridden per tenant.
   */
  tracingActive;

  /**
   * @private
   * @type {string|undefined}
   * @description The API key for LangSmith. Required for any tracing.
   */
  apiKey;

  /**
   * @private
   * @type {string}
   * @description The base name for the platform, used as a prefix for tenant-specific project names.
   */
  platformPrefix;

  /**
   * @private
   * @type {string}
   * @description The default project name.
   */
  projectName;

  /**
   * @private
   * @type {string}
   * @description The default project name for system-level or untagged traces.
   */
  defaultProjectName;

  /**
   * @private
   * @type {string}
   * @description The endpoint URL for the LangSmith API.
   */
  endpoint;

  /**
   * @private
   * @type {string[]}
   * @description Platform Owner override: An array of tenant IDs for which tracing should be
   *              force-enabled, regardless of the global `tracingActive` setting.
   */
  forceTraceForTenants;

  /**
   * @constructor
   * @description
   * Initializes the LangsmithMiddleware instance by loading LangSmith configuration.
   * It prioritizes environment variables (`process.env`) over the application's `config` object.
   */
  constructor() {
    try {
      this.apiKey = process.env.LANGCHAIN_API_KEY || config.langchain?.apiKey;
      this.tracingActive = process.env.LANGCHAIN_TRACING_V2 === 'true' || config.langchain?.tracingActive === 'true' || config.langchain?.tracingActive === true;
      this.platformPrefix = config.langchain?.projectPrefix || 'Inso AI-Assistant';
      this.projectName = process.env.LANGCHAIN_PROJECT || config.langchain?.project || 'Inso AI-Assistant-RAG';
      this.defaultProjectName = this.projectName;
      this.endpoint = process.env.LANGCHAIN_ENDPOINT || config.langchain?.endpoint || 'https://api.smith.langchain.com';
      this.forceTraceForTenants = config.langchain?.forceTraceForTenants || [];
    } catch (error) {
      // PATCH: Added robust error handling for initialization.
      // A configuration error at startup is fatal. Log the error and re-throw to crash the server,
      // preventing it from running in a misconfigured state.
      logger.error('[LangSmith Middleware] Failed to initialize due to a configuration error. Check config files.', {
        errorMessage: error.message,
        errorStack: error.stack,
      });
      throw new Error(`LangSmith Middleware initialization failed: ${error.message}`);
    }
  }

  /**
   * @method isTracingEnabledForTenant
   * @description
   * Determines if tracing should be active for a given tenant.
   * Tracing is enabled if it's globally active OR if the tenant ID is in the force-tracing override list.
   * A valid API key is always required.
   * @param {string} [tenantId] - The ID of the tenant to check.
   * @returns {boolean} True if tracing should be enabled, false otherwise.
   */
  isTracingEnabledForTenant(tenantId) {
    if (!this.apiKey) {
      return false;
    }
    const isForced = tenantId ? this.forceTraceForTenants.includes(tenantId) : false;
    return this.tracingActive || isForced;
  }

  /**
   * @method getProjectNameForTenant
   * @description
   * Constructs a LangSmith project name. If a tenantId is provided, it creates a tenant-specific
   * project name. Otherwise, it returns the default global project name.
   * @param {string} [tenantId] - The ID of the tenant.
   * @returns {string} The calculated LangSmith project name.
   */
  getProjectNameForTenant(tenantId) {
    return tenantId ? `${this.platformPrefix}-${tenantId}` : this.defaultProjectName;
  }

  /**
   * @method getLangSmithConfig
   * @description
   * The primary method for integrating with LangChain runnables. It returns a configuration
   * object containing callbacks, metadata, and a run name, tailored for a specific request.
   * This object should be passed to a runnable's `.withConfig()` method.
   * @param {object} [options={}] - Options for the trace configuration.
   * @param {string} [options.tenantId] - The tenant context for this run.
   * @param {string} [options.userId] - The user context for this run.
   * @param {string} [options.requestId] - A unique ID to trace a single request across services.
   * @param {string} [options.runName='Agentic-RAG-Execution'] - A descriptive name for the LangChain run.
   * @returns {object} A configuration object for `runnable.withConfig()`, or an empty object if tracing is disabled.
   */
  getLangSmithConfig({ tenantId, userId, requestId, runName = 'Agentic-RAG-Execution' } = {}) {
    if (!this.isTracingEnabledForTenant(tenantId)) {
      return {};
    }

    try {
      // PATCH: Added try-catch around external dependency instantiation.
      // If the LangChainTracer constructor fails, we need to handle it gracefully.
      const projectName = this.getProjectNameForTenant(tenantId);
      const tracer = new LangChainTracer({ projectName });

      // Platform Owner Oversight: Collect all relevant IDs as metadata for powerful filtering in LangSmith.
      const metadata = {
        platform_request_id: requestId,
        tenant_id: tenantId,
        user_id: userId,
      };

      // Clean up metadata to not include empty values.
      Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

      return {
        callbacks: [tracer],
        metadata,
        name: runName, // 'name' is the key used by LangChain for the top-level run name.
      };
    } catch (error) {
      // PATCH: Log the internal error and throw a normalized ApiError.
      // This prevents the server from crashing during a request and allows the global
      // error handler to send a standardized 500 response.
      logger.error('[LangSmith Middleware] Failed to create LangSmith tracer configuration.', {
        errorMessage: error.message,
        errorStack: error.stack,
        tenantId,
        userId,
        requestId,
      });
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Internal error: Failed to configure request tracing.', true, error.stack);
    }
  }

  /**
   * @method getTracingEnv
   * @description
   * Returns an environment variables object configuration for LangSmith.
   * Used for passing environment variables dynamically.
   * @returns {object} The environment variables or empty object.
   */
  getTracingEnv() {
    if (!this.tracingActive || !this.apiKey) {
      return {};
    }
    return {
      LANGCHAIN_TRACING_V2: 'true',
      LANGCHAIN_API_KEY: this.apiKey,
      LANGCHAIN_PROJECT: this.defaultProjectName,
      LANGCHAIN_ENDPOINT: this.endpoint,
    };
  }

  /**
   * @method getTraceCallbacks
   * @description
   * Returns trace callbacks containing a LangChainTracer instance.
   * @param {string} [runName] - Optional name of the run.
   * @returns {any[]} Array of trace callback handlers.
   */
  getTraceCallbacks(runName) {
    if (!this.tracingActive || !this.apiKey) {
      return [];
    }
    try {
      const tracer = new LangChainTracer();
      return [tracer];
    } catch (error) {
      logger.error('[LangSmith Middleware] Failed to create LangChainTracer for callback.', error);
      return [];
    }
  }

  /**
   * @method logDiagnostics
   * @description
   * Logs the current status of LangSmith tracing for the Platform Owner.
   * It details the global status, API key presence, and override configurations.
   * @returns {void}
   */
  logDiagnostics() {
    try {
      if (this.tracingActive && this.apiKey) {
        logger.info(`[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "${this.projectName}"`);
      } else {
        logger.info('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
      }
    } catch (error) {
      console.error('[LangSmith Middleware] CRITICAL: The logger failed while reporting diagnostic info.', error);
    }
  }
}

/**
 * @constant {LangsmithMiddleware} langsmithMiddleware
 * @description
 * An exported singleton instance of the `LangsmithMiddleware` class.
 * This instance is initialized upon import and logs its diagnostic status,
 * providing immediate feedback on the platform's observability configuration.
 */
export const langsmithMiddleware = new LangsmithMiddleware();
langsmithMiddleware.logDiagnostics();