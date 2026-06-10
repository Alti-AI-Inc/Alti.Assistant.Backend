import { describe, it, expect } from 'vitest';
import { TranscriptionValidation } from './transcription.validation.js';

const {
  smartAssistantSchema,
  transcribeAudioSchema,
  transcribeInlineAudioSchema,
  batchTranscribeSchema,
  analyzeSegmentSchema,
  guestRateLimitSchema,
} = TranscriptionValidation;

describe('TranscriptionValidation Schemas', () => {
  describe('smartAssistantSchema', () => {
    it('should pass with a valid chat message', () => {
      const result = smartAssistantSchema.safeParse({
        body: { message: 'Hello, assistant!' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with valid audio processing parameters', () => {
      const result = smartAssistantSchema.safeParse({
        body: {
          prompt: 'Transcribe this audio.',
          processingType: 'transcribe',
          startTimestamp: '01:23',
          endTimestamp: '05:45',
          conversationId: 'conv-123',
          outputFormat: 'json',
          includeTimestamps: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with an empty body as all fields are optional', () => {
      const result = smartAssistantSchema.safeParse({ body: {} });
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid processingType', () => {
      const result = smartAssistantSchema.safeParse({
        body: { processingType: 'invalid-type' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail with an invalid startTimestamp format', () => {
      const result = smartAssistantSchema.safeParse({
        body: { startTimestamp: '60:00' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(
        'Timestamp must be in MM:SS format'
      );
    });

    it('should fail with an invalid endTimestamp format', () => {
      const result = smartAssistantSchema.safeParse({
        body: { endTimestamp: '12:61' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(
        'Timestamp must be in MM:SS format'
      );
    });

    it('should fail with an invalid outputFormat', () => {
      const result = smartAssistantSchema.safeParse({
        body: { outputFormat: 'xml' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if a field has the wrong type', () => {
      const result = smartAssistantSchema.safeParse({
        body: { includeTimestamps: 'yes' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Expected boolean, received string'
      );
    });
  });

  describe('transcribeAudioSchema', () => {
    it('should pass with an empty body and apply defaults', () => {
      const result = transcribeAudioSchema.safeParse({ body: {} });
      expect(result.success).toBe(true);
      expect(result.data.body.processingType).toBe('transcribe');
      expect(result.data.body.outputFormat).toBe('text');
      expect(result.data.body.includeTimestamps).toBe(false);
    });

    it('should pass with valid provided values', () => {
      const data = {
        body: {
          prompt: 'A test prompt',
          processingType: 'summarize',
          startTimestamp: '00:10',
          endTimestamp: '00:50',
          outputFormat: 'json',
          includeTimestamps: true,
        },
      };
      const result = transcribeAudioSchema.safeParse(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should fail with an invalid timestamp', () => {
      const result = transcribeAudioSchema.safeParse({
        body: { startTimestamp: 'invalid-time' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transcribeInlineAudioSchema', () => {
    const validBody = {
      audioData: 'base64encodedstring',
      mimeType: 'audio/mp3',
      prompt: 'Transcribe this.',
    };

    it('should pass with valid required fields', () => {
      const result = transcribeInlineAudioSchema.safeParse({
        body: {
          audioData: 'base64encodedstring',
          mimeType: 'audio/wav',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.processingType).toBe('transcribe'); // Check default
    });

    it('should fail if audioData is missing', () => {
      const result = transcribeInlineAudioSchema.safeParse({
        body: { mimeType: 'audio/mp3' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Audio data is required');
    });

    it('should fail if audioData is empty', () => {
      const result = transcribeInlineAudioSchema.safeParse({
        body: { audioData: '', mimeType: 'audio/mp3' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Audio data cannot be empty'
      );
    });

    it('should fail if mimeType is missing', () => {
      const result = transcribeInlineAudioSchema.safeParse({
        body: { audioData: 'base64encodedstring' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Required');
    });

    it('should fail with an invalid mimeType', () => {
      const result = transcribeInlineAudioSchema.safeParse({
        body: {
          audioData: 'base64encodedstring',
          mimeType: 'application/json',
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });
  });

  describe('batchTranscribeSchema', () => {
    it('should pass with a valid single-file batch', () => {
      const result = batchTranscribeSchema.safeParse({
        body: {
          audioFiles: [{ fileId: 'file-1' }],
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.audioFiles[0].processingType).toBe('transcribe');
    });

    it('should pass with a valid multi-file batch', () => {
      const result = batchTranscribeSchema.safeParse({
        body: {
          audioFiles: [
            { fileId: 'file-1', processingType: 'summarize' },
            { fileId: 'file-2', prompt: 'Analyze this' },
          ],
          outputFormat: 'json',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if audioFiles is empty', () => {
      const result = batchTranscribeSchema.safeParse({
        body: { audioFiles: [] },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Array must contain at least 1 element(s)'
      );
    });

    it('should fail if audioFiles has more than 10 items', () => {
      const files = Array.from({ length: 11 }, (_, i) => ({
        fileId: `file-${i}`,
      }));
      const result = batchTranscribeSchema.safeParse({
        body: { audioFiles: files },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Array must contain at most 10 element(s)'
      );
    });

    it('should fail if an item in audioFiles is missing fileId', () => {
      const result = batchTranscribeSchema.safeParse({
        body: { audioFiles: [{ prompt: 'no file id' }] },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual([
        'body',
        'audioFiles',
        0,
        'fileId',
      ]);
      expect(result.error.issues[0].message).toBe('Required');
    });
  });

  describe('analyzeSegmentSchema', () => {
    it('should pass with a valid single segment', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          fileId: 'file-abc',
          segments: [{ start: '00:10', end: '00:25' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with multiple valid segments', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          fileId: 'file-abc',
          segments: [
            { start: '01:00', end: '01:15', prompt: 'What is said here?' },
            { start: '02:30', end: '02:45' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if fileId is missing', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          segments: [{ start: '00:10', end: '00:25' }],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('File ID is required');
    });

    it('should fail if segments array is empty', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          fileId: 'file-abc',
          segments: [],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Array must contain at least 1 element(s)'
      );
    });

    it('should fail if a segment is missing the start timestamp', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          fileId: 'file-abc',
          segments: [{ end: '00:25' }],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual([
        'body',
        'segments',
        0,
        'start',
      ]);
    });

    it('should fail if a segment has an invalid end timestamp', () => {
      const result = analyzeSegmentSchema.safeParse({
        body: {
          fileId: 'file-abc',
          segments: [{ start: '00:10', end: 'not-a-time' }],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(
        'Timestamp must be in MM:SS format'
      );
    });
  });

  describe('guestRateLimitSchema', () => {
    it('should pass with an empty object', () => {
      const result = guestRateLimitSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should pass with a valid x-guest-id', () => {
      const result = guestRateLimitSchema.safeParse({
        'x-guest-id': 'guest-12345',
      });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid x-forwarded-for', () => {
      const result = guestRateLimitSchema.safeParse({
        'x-forwarded-for': '192.168.1.1',
      });
      expect(result.success).toBe(true);
    });

    it('should pass with both valid headers', () => {
      const result = guestRateLimitSchema.safeParse({
        'x-guest-id': 'guest-12345',
        'x-forwarded-for': '192.168.1.1',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if a header has the wrong type', () => {
      const result = guestRateLimitSchema.safeParse({ 'x-guest-id': 123 });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Expected string, received number'
      );
    });
  });
});