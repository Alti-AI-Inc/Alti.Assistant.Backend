import { EventEmitter } from 'events';

export const telemetryEmitter = new EventEmitter();

// Limit listeners count to avoid memory leak warnings during concurrent operations
telemetryEmitter.setMaxListeners(100);

/**
 * Emit a real-time progress update for an active research thread.
 * 
 * @param {string} conversationId - Active conversation thread ID
 * @param {object} data - Progress update attributes
 * @param {string} data.step - Step identifier (e.g. 'breadth_search')
 * @param {string} data.message - Short descriptive update message
 * @param {number} data.percentage - Estimated progress percentage (0 - 100)
 * @param {object} [data.metadata] - Optional additional state facts
 */
export const emitTelemetryProgress = (conversationId, data) => {
  if (!conversationId) return;

  telemetryEmitter.emit('progress', {
    conversationId,
    timestamp: new Date().toISOString(),
    ...data,
  });
};
