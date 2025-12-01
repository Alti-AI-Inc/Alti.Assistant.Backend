import * as zod from 'zod';
const { z } = zod;

// Smart assistant validation - handles all types of requests
const smartAssistantSchema = z.object({
  body: z.object({
    // For chat messages
    message: z.string().optional(),

    // For audio processing
    prompt: z.string().optional(),
    processingType: z.enum(['transcribe', 'describe', 'summarize', 'analyze', 'segment', 'question']).optional(),
    startTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(), // MM:SS format
    endTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(), // MM:SS format
    conversationId: z.string().optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).optional(),
    includeTimestamps: z.boolean().optional(),
  }),
});

// Legacy schema (keeping for backwards compatibility)
const transcribeAudioSchema = z.object({
  body: z.object({
    prompt: z.string().optional(),
    processingType: z.enum(['transcribe', 'describe', 'summarize', 'analyze', 'segment', 'question']).default('transcribe'),
    startTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(), // MM:SS format
    endTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(), // MM:SS format
    conversationId: z.string().optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
    includeTimestamps: z.boolean().default(false),
  }),
});

// Validate inline audio data
const transcribeInlineAudioSchema = z.object({
  body: z.object({
    audioData: z.string({
      required_error: 'Audio data is required',
    }).min(1, 'Audio data cannot be empty'),
    mimeType: z.enum(['audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac']),
    prompt: z.string().optional(),
    processingType: z.enum(['transcribe', 'describe', 'summarize', 'analyze', 'segment', 'question']).default('transcribe'),
    startTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(),
    endTimestamp: z.string().regex(/^(\d{2}):(\d{2})$/).optional(),
    conversationId: z.string().optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
    includeTimestamps: z.boolean().default(false),
  }),
});

// Validate batch transcription
const batchTranscribeSchema = z.object({
  body: z.object({
    audioFiles: z.array(z.object({
      fileId: z.string(),
      prompt: z.string().optional(),
      processingType: z.enum(['transcribe', 'describe', 'summarize', 'analyze', 'segment', 'question']).default('transcribe'),
    })).min(1).max(10), // Max 10 files per batch
    conversationId: z.string().optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
  }),
});

// Validate segment analysis
const analyzeSegmentSchema = z.object({
  body: z.object({
    fileId: z.string({
      required_error: 'File ID is required',
    }),
    segments: z.array(z.object({
      start: z.string().regex(/^(\d{2}):(\d{2})$/),
      end: z.string().regex(/^(\d{2}):(\d{2})$/),
      prompt: z.string().optional(),
    })).min(1).max(50), // Max 50 segments per request
    conversationId: z.string().optional(),
  }),
});

// Schema for guest user rate limiting
const guestRateLimitSchema = z.object({
  headers: z.object({
    'x-guest-id': z.string().optional(),
    'x-forwarded-for': z.string().optional(),
  }).optional(),
});

export const TranscriptionValidation = {
  smartAssistantSchema,
  transcribeAudioSchema,
  transcribeInlineAudioSchema,
  batchTranscribeSchema,
  analyzeSegmentSchema,
  guestRateLimitSchema,
};
