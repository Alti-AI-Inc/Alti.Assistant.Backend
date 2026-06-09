import { describe, it, expect, vi, beforeEach } from 'vitest';
import { telemetryEmitter, emitTelemetryProgress } from './telemetryService'; // Adjust path as needed

describe('telemetryService', () => {
  let emitSpy;

  beforeEach(() => {
    // Spy on the emit method of the telemetryEmitter
    emitSpy = vi.spyOn(telemetryEmitter, 'emit');
    // Clear any previous calls to the spy before each test
    emitSpy.mockClear();
    // Use fake timers to control Date objects for consistent timestamp testing
    vi.useFakeTimers();
  });

  // Restore real timers after all tests are done, though Vitest often handles this automatically
  // when `vi.useFakeTimers()` is called in `beforeEach`.
  // afterAll(() => {
  //   vi.useRealTimers();
  // });

  describe('emitTelemetryProgress', () => {
    it('should emit a "progress" event with the correct payload including timestamp', () => {
      const conversationId = 'test-conv-123';
      const data = {
        step: 'breadth_search',
        message: 'Starting breadth search for initial topics.',
        percentage: 10,
        metadata: { query: 'AI ethics' },
      };
      const fixedDate = new Date('2023-10-27T10:00:00.000Z');
      vi.setSystemTime(fixedDate);

      emitTelemetryProgress(conversationId, data);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('progress', {
        conversationId,
        timestamp: fixedDate.toISOString(),
        ...data,
      });
    });

    it('should emit a "progress" event correctly when optional metadata is omitted', () => {
      const conversationId = 'test-conv-456';
      const data = {
        step: 'depth_search',
        message: 'Deep diving into specific articles.',
        percentage: 50,
      };
      const fixedDate = new Date('2023-10-27T10:05:00.000Z');
      vi.setSystemTime(fixedDate);

      emitTelemetryProgress(conversationId, data);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('progress', {
        conversationId,
        timestamp: fixedDate.toISOString(),
        ...data,
      });
    });

    it('should not emit if conversationId is null', () => {
      const data = {
        step: 'validation',
        message: 'Validating sources.',
        percentage: 75,
      };

      emitTelemetryProgress(null, data);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not emit if conversationId is undefined', () => {
      const data = {
        step: 'validation',
        message: 'Validating sources.',
        percentage: 75,
      };

      emitTelemetryProgress(undefined, data);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not emit if conversationId is an empty string', () => {
      const data = {
        step: 'validation',
        message: 'Validating sources.',
        percentage: 75,
      };

      emitTelemetryProgress('', data);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should always include a valid ISO 8601 timestamp string', () => {
      const conversationId = 'test-conv-789';
      const data = {
        step: 'finalizing',
        message: 'Compiling final report.',
        percentage: 100,
      };
      const fixedDate = new Date('2023-10-27T10:15:30.123Z');
      vi.setSystemTime(fixedDate);

      emitTelemetryProgress(conversationId, data);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const emittedPayload = emitSpy.mock.calls[0][1];
      expect(emittedPayload).toHaveProperty('timestamp');
      expect(emittedPayload.timestamp).toBe(fixedDate.toISOString());
      // Further validate that the timestamp is a correctly formatted ISO string
      expect(() => new Date(emittedPayload.timestamp)).not.toThrow();
      expect(new Date(emittedPayload.timestamp).toISOString()).toBe(emittedPayload.timestamp);
    });
  });
});