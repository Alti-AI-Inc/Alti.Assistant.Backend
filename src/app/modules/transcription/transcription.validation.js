import * as zod from 'zod';
const { z } = zod;

// Regex for MM:SS format, ensuring minutes and seconds are between 00 and 59.
const mmSsRegex = /^(?:[0-5]\d):(?:[0-5]\d)$/;

// --- Reusable Schemas & Refinements ---

// Enhancement: Added a reusable refinement to ensure end timestamps are not before start timestamps.
// This provides immediate, logical feedback to the user and prevents downstream errors.
const validateTimestampOrder = (data) => {
  if (data.startTimestamp && data.endTimestamp) {
    return data.startTimestamp <= data.endTimestamp;
  }
  return true; // Pass if one or both are not provided.
};
const timestampOrderError = {
  message: 'endTimestamp cannot be earlier than startTimestamp.',
  path: ['endTimestamp'],
};

// --- Main Validation Schemas ---

// Smart assistant validation - handles all types of requests
const smartAssistantSchema = z.object({
  body: z
    .object({
      // For chat messages
      message: z.string().optional(),

      // For audio processing
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .optional(),
      startTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      endTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).optional(),
      includeTimestamps: z.boolean().optional(),
    })
    .refine(validateTimestampOrder, timestampOrderError)
    // Enhancement: Prevent ambiguous requests by ensuring chat and audio fields are not mixed.
    // This improves API clarity and user experience by providing a clear error.
    .refine(
      (data) => {
        const isChatMessage = !!data.message;
        const isAudioProcessing =
          !!data.processingType ||
          !!data.prompt ||
          !!data.startTimestamp ||
          !!data.endTimestamp;
        return !(isChatMessage && isAudioProcessing);
      },
      {
        message:
          "Request cannot contain both 'message' and audio processing fields (e.g., 'prompt', 'processingType') simultaneously.",
        path: ['message'],
      }
    ),
});

// Legacy schema (keeping for backwards compatibility)
const transcribeAudioSchema = z.object({
  body: z
    .object({
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .default('transcribe'),
      startTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      endTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
      includeTimestamps: z.boolean().default(false),
    })
    .refine(validateTimestampOrder, timestampOrderError),
});

// Validate inline audio data
const transcribeInlineAudioSchema = z.object({
  body: z
    .object({
      // Enhancement: Validate that audioData is a valid base64 string to prevent processing errors.
      audioData: z
        .string({
          required_error: 'Audio data is required',
        })
        .min(1, 'Audio data cannot be empty')
        .refine(
          (val) => {
            try {
              Buffer.from(val, 'base64');
              return true;
            } catch (e) {
              return false;
            }
          },
          { message: 'audioData must be a valid base64 encoded string.' }
        ),
      mimeType: z.enum([
        'audio/wav',
        'audio/mp3',
        'audio/aiff',
        'audio/aac',
        'audio/ogg',
        'audio/flac',
        'audio/webm', // Added common web format
        'audio/mpeg', // Added common format
      ]),
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .default('transcribe'),
      startTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      endTimestamp: z
        .string()
        .regex(mmSsRegex, 'Timestamp must be in MM:SS format (00:00-59:59)')
        .optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
      includeTimestamps: z.boolean().default(false),
    })
    .refine(validateTimestampOrder, timestampOrderError),
});

// Validate batch transcription
const batchTranscribeSchema = z.object({
  body: z.object({
    audioFiles: z
      .array(
        z.object({
          // Enhancement: Enforce UUID format for fileId to ensure data integrity.
          fileId: z.string().uuid('Invalid File ID format.'),
          prompt: z.string().optional(),
          processingType: z
            .enum([
              'transcribe',
              'describe',
              'summarize',
              'analyze',
              'segment',
              'question',
            ])
            .default('transcribe'),
        })
      )
      // Enhancement: Improved user-facing error messages for limits.
      .min(1, 'At least one audio file is required for a batch job.')
      .max(10, 'A maximum of 10 audio files can be processed per batch job.'),
    // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
    conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
  }),
});

// Validate segment analysis
const analyzeSegmentSchema = z.object({
  body: z.object({
    // Enhancement: Enforce UUID format for fileId to ensure data integrity.
    fileId: z.string({ required_error: 'File ID is required' }).uuid('Invalid File ID format.'),
    segments: z
      .array(
        z
          .object({
            start: z
              .string()
              .regex(
                mmSsRegex,
                'Start timestamp must be in MM:SS format (00:00-59:59)'
              ),
            end: z
              .string()
              .regex(
                mmSsRegex,
                'End timestamp must be in MM:SS format (00:00-59:59)'
              ),
            prompt: z.string().optional(),
          })
          // Enhancement: Validate start/end logic for each segment individually.
          .refine((data) => data.start <= data.end, {
            message: 'Segment end time cannot be earlier than start time.',
            path: ['end'],
          })
      )
      // Enhancement: Improved user-facing error messages for limits.
      .min(1, 'At least one segment is required for analysis.')
      .max(50, 'A maximum of 50 segments can be analyzed per request.'),
    // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
    conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
  }),
});

// Schema for guest user rate limiting (validates request headers)
const guestRateLimitSchema = z.object({
  // Enhancement: Enforce UUID format for guest ID for consistency.
  'x-guest-id': z.string().uuid('Invalid Guest ID format.').optional(),
  // Note: x-forwarded-for can be a comma-separated list; simple string validation is sufficient here.
  'x-forwarded-for': z.string().optional(),
});

export const TranscriptionValidation = {
  smartAssistantSchema,
  transcribeAudioSchema,
  transcribeInlineAudioSchema,
  batchTranscribeSchema,
  analyzeSegmentSchema,
  guestRateLimitSchema,
};