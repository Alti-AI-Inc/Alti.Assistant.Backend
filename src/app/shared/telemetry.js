import { logger } from './logger.js';
import { trace, context } from '@opentelemetry/api';

export const TelemetryService = {
  startAgentTrace(agentName, input) {
    logger.info(`[OpenTelemetry] 📡 Starting distributed trace for Agent: ${agentName}`);
    const tracer = trace.getTracer('aphura-agent-orchestrator');
    const span = tracer.startSpan(`agent_execution_${agentName}`);
    span.setAttribute('agent.input', JSON.stringify(input));
    return span;
  },

  endAgentTrace(span, output, error = null) {
    if (error) {
      span.setAttribute('error', true);
      span.setAttribute('agent.error_message', error.message);
      logger.error(`[OpenTelemetry] 📡 Trace failed with error.`);
    } else {
      span.setAttribute('agent.output', JSON.stringify(output));
      logger.info(`[OpenTelemetry] 📡 Trace completed successfully.`);
    }
    span.end();
  }
};
