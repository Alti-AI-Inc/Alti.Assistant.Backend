import { logger } from '../../shared/logger.js';

/**
 * Telemetry Service — OpenTelemetry-powered distributed tracing.
 * Apache 2.0 License.
 *
 * Provides:
 * - Auto-instrumentation for Express, MongoDB, Redis
 * - Custom span helpers for LLM calls, tool executions, RAG queries
 * - Exportable to any OTel backend (Jaeger, Zipkin, Grafana)
 */

let trace, context, SpanStatusCode;
let initialized = false;

async function initOTel() {
  if (initialized) return;
  try {
    const api = await import('@opentelemetry/api');
    trace = api.trace;
    context = api.context;
    SpanStatusCode = api.SpanStatusCode;
    initialized = true;
    logger.info('[TelemetryService] OpenTelemetry API initialized');
  } catch (err) {
    logger.warn(`[TelemetryService] OpenTelemetry not available: ${err.message}`);
    initialized = true;
  }
}

const TRACER_NAME = 'inso-ai-backend';

export const TelemetryService = {
  /**
   * Get or create the application tracer.
   */
  async getTracer() {
    await initOTel();
    if (!trace) return null;
    return trace.getTracer(TRACER_NAME, '1.0.0');
  },

  /**
   * Start a custom span for an operation.
   * Returns { span, end() } helper.
   */
  async startSpan(name, attributes = {}) {
    const tracer = await this.getTracer();
    if (!tracer) {
      // Return no-op span
      return {
        span: null,
        end: () => {},
        setAttributes: () => {},
        setStatus: () => {},
        addEvent: () => {},
      };
    }

    const span = tracer.startSpan(name, { attributes });

    return {
      span,
      end: () => span.end(),
      setAttributes: (attrs) => {
        for (const [key, value] of Object.entries(attrs)) {
          span.setAttribute(key, value);
        }
      },
      setStatus: (status, message) => {
        span.setStatus({
          code: status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          message,
        });
      },
      addEvent: (name, attrs) => span.addEvent(name, attrs),
    };
  },

  /**
   * Trace an LLM call with model, tokens, and latency.
   */
  async traceLLMCall(model, fn) {
    const spanHelper = await this.startSpan('llm.call', {
      'llm.model': model,
      'llm.provider': 'llm',
    });

    const startTime = Date.now();
    try {
      const result = await fn();
      const latencyMs = Date.now() - startTime;

      const usage = result?.usage || result?.choices?.[0]?.usage;
      spanHelper.setAttributes({
        'llm.latency_ms': latencyMs,
        'llm.prompt_tokens': usage?.prompt_tokens || 0,
        'llm.completion_tokens': usage?.completion_tokens || 0,
        'llm.total_tokens': usage?.total_tokens || 0,
      });
      spanHelper.setStatus('ok');
      spanHelper.end();

      return result;
    } catch (err) {
      spanHelper.setStatus('error', err.message);
      spanHelper.addEvent('error', { 'error.message': err.message });
      spanHelper.end();
      throw err;
    }
  },

  /**
   * Trace a tool execution.
   */
  async traceToolCall(toolName, fn) {
    const spanHelper = await this.startSpan('tool.call', {
      'tool.name': toolName,
      'tool.provider': 'composio',
    });

    const startTime = Date.now();
    try {
      const result = await fn();
      spanHelper.setAttributes({
        'tool.latency_ms': Date.now() - startTime,
        'tool.success': true,
      });
      spanHelper.setStatus('ok');
      spanHelper.end();
      return result;
    } catch (err) {
      spanHelper.setAttributes({
        'tool.latency_ms': Date.now() - startTime,
        'tool.success': false,
      });
      spanHelper.setStatus('error', err.message);
      spanHelper.end();
      throw err;
    }
  },

  /**
   * Trace a RAG query.
   */
  async traceRAGQuery(collectionId, fn) {
    const spanHelper = await this.startSpan('rag.query', {
      'rag.collection_id': collectionId || 'default',
    });

    const startTime = Date.now();
    try {
      const result = await fn();
      spanHelper.setAttributes({
        'rag.latency_ms': Date.now() - startTime,
        'rag.chunks_retrieved': result?.sources?.length || result?.chunks?.length || 0,
      });
      spanHelper.setStatus('ok');
      spanHelper.end();
      return result;
    } catch (err) {
      spanHelper.setStatus('error', err.message);
      spanHelper.end();
      throw err;
    }
  },

  /**
   * Get current trace/span context info for logging.
   */
  async getContextInfo() {
    await initOTel();
    if (!trace || !context) return { traceId: null, spanId: null };

    const span = trace.getSpan(context.active());
    if (!span) return { traceId: null, spanId: null };

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  },

  /**
   * Initialize OTel SDK with auto-instrumentation.
   * Call this BEFORE Express starts in index.js.
   */
  async initSDK() {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

      const sdk = new NodeSDK({
        serviceName: 'inso-ai-backend',
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
          }),
        ],
      });

      sdk.start();
      logger.info('[TelemetryService] OpenTelemetry SDK started with auto-instrumentation');
      return sdk;
    } catch (err) {
      logger.warn(`[TelemetryService] OTel SDK init skipped: ${err.message}`);
      return null;
    }
  },
};

export default TelemetryService;
