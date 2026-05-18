# Transcription Module - Gemini Audio Understanding API

This module provides comprehensive audio processing capabilities using Google's Gemini API, following the architecture pattern from the search module.

## Features

### Audio Processing Types

- **Transcribe**: Generate detailed transcripts of speech
- **Describe**: Describe audio content including sounds, music, and speech
- **Summarize**: Provide concise summaries of audio content
- **Analyze**: Analyze themes, topics, speakers, and tone
- **Segment**: Break down audio into distinct segments with timestamps
- **Question**: Answer questions about audio content

### Supported Audio Formats

- WAV (`audio/wav`)
- MP3 (`audio/mp3`)
- AIFF (`audio/aiff`)
- AAC (`audio/aac`)
- OGG Vorbis (`audio/ogg`)
- FLAC (`audio/flac`)

### Key Capabilities

- **File Upload**: Upload audio files up to 20MB
- **Inline Processing**: Process base64-encoded audio data directly
- **Batch Processing**: Process multiple audio files in one request
- **Segment Analysis**: Analyze specific time segments using MM:SS timestamps
- **Conversation History**: Track processing history for authenticated users
- **Guest Access**: Limited functionality for unauthenticated users
- **Token Counting**: Estimate token usage (32 tokens per second of audio)

## API Endpoints

### 1. Transcribe Audio File

**POST** `/transcription/transcribe`

Upload and process an audio file.

**Headers:**

- `Authorization: Bearer <token>` (optional for guests)
- `Content-Type: multipart/form-data`

**Body (form-data):**

- `audio` (file, required): Audio file
- `prompt` (string, optional): Additional instructions
- `processingType` (string, optional): One of `transcribe`, `describe`, `summarize`, `analyze`, `segment`, `question` (default: `transcribe`)
- `startTimestamp` (string, optional): Start time in MM:SS format
- `endTimestamp` (string, optional): End time in MM:SS format
- `conversationId` (string, optional): Existing conversation ID
- `outputFormat` (string, optional): `text`, `json`, `srt`, `vtt` (default: `text`)
- `includeTimestamps` (boolean, optional): Include timestamps in output

**Example:**

```bash
curl -X POST http://localhost:5000/transcription/transcribe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@/path/to/audio.mp3" \
  -F "processingType=transcribe" \
  -F "includeTimestamps=true"
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Audio processed successfully",
  "data": {
    "conversationId": "transcription-1234567890-abc",
    "result": "This is the transcribed text...",
    "processingType": "transcribe",
    "metadata": {
      "fileName": "audio.mp3",
      "tokenCount": 1920,
      "estimatedDuration": 60,
      "model": "gemini-2.5-flash"
    }
  }
}
```

### 2. Transcribe Inline Audio

**POST** `/transcription/transcribe/inline`

Process base64-encoded audio data directly.

**Headers:**

- `Authorization: Bearer <token>` (optional)
- `Content-Type: application/json`

**Body:**

```json
{
  "audioData": "base64_encoded_audio_data",
  "mimeType": "audio/mp3",
  "prompt": "Transcribe this audio",
  "processingType": "transcribe",
  "conversationId": "optional-conversation-id",
  "outputFormat": "text",
  "includeTimestamps": false
}
```

### 3. Batch Transcribe

**POST** `/transcription/transcribe/batch`

Process multiple audio files in one request (max 10 files).

**Headers:**

- `Authorization: Bearer <token>` (optional)
- `Content-Type: multipart/form-data`

**Body (form-data):**

- `audio` (files): Multiple audio files
- `audioFiles` (JSON string): Configuration for each file
- `conversationId` (string, optional)
- `outputFormat` (string, optional)

**Example audioFiles JSON:**

```json
[
  {
    "fileId": "file1",
    "prompt": "Transcribe this",
    "processingType": "transcribe"
  },
  {
    "fileId": "file2",
    "prompt": "Summarize this",
    "processingType": "summarize"
  }
]
```

### 4. Analyze Segments

**POST** `/transcription/analyze/segments`

Analyze specific time segments of an audio file.

**Headers:**

- `Authorization: Bearer <token>` (optional)
- `Content-Type: application/json`

**Body:**

```json
{
  "fileId": "previously-uploaded-file-uri",
  "segments": [
    {
      "start": "00:30",
      "end": "01:45",
      "prompt": "What is discussed in this segment?"
    },
    {
      "start": "02:00",
      "end": "03:30",
      "prompt": "Summarize this part"
    }
  ],
  "conversationId": "optional-conversation-id"
}
```

### 5. Get Statistics

**GET** `/transcription/stats`

Get transcription statistics for authenticated users only.

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Transcription statistics retrieved successfully",
  "data": {
    "totalTranscriptions": 45,
    "totalDuration": 3600,
    "totalTokens": 115200,
    "averageDuration": 80,
    "processingTypes": {
      "transcribe": 30,
      "summarize": 10,
      "analyze": 5
    },
    "conversationCount": 12
  }
}
```

## Technical Details

### Token Calculation

- **32 tokens per second** of audio
- 1 minute of audio = 1,920 tokens
- 9.5 hours maximum audio length per request

### File Size Limits

- **20MB maximum** for inline requests
- For larger files, use the upload endpoint with Files API
- Guest users limited to 5 minutes of audio

### Audio Processing

- Downsampled to 16 Kbps
- Multi-channel audio combined to single channel
- Supports non-speech sounds (music, effects, ambient noise)

### Rate Limits

- **Authenticated users**: 20 requests per 15 minutes
- **Guest users**: 5 requests per 60 minutes
- **Batch requests**: 10 per 15 minutes

## Usage Examples

### Example 1: Simple Transcription

```javascript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('processingType', 'transcribe');

const response = await fetch('/transcription/transcribe', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
console.log(result.data.result);
```

### Example 2: Segment Analysis

```javascript
const response = await fetch('/transcription/transcribe', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData
    .append('audio', file)
    .append('startTimestamp', '02:30')
    .append('endTimestamp', '03:29')
    .append('prompt', 'Transcribe this segment'),
});
```

### Example 3: Audio Description

```javascript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('processingType', 'describe');
formData.append('prompt', 'Describe all sounds and music in this audio');

const response = await fetch('/transcription/transcribe', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

## Architecture

### Module Structure

```
transcription/
├── transcription.constant.js      # Constants and configuration
├── transcription.validation.js    # Zod validation schemas
├── transcription.service.js       # Business logic and helpers
├── transcription.controller.js    # Request handlers
├── transcription.route.js         # Route definitions
└── geminiAudioService.js          # Gemini API integration
```

### Key Components

#### Constants

- Processing types, audio formats, rate limits
- Validation rules and error messages
- Guest user configuration

#### Service Layer

- Conversation management
- Token calculation
- Timestamp parsing
- Statistics aggregation

#### Gemini Service

- File upload to Gemini Files API
- Audio processing with different prompts
- Inline audio handling
- Token counting

#### Controller

- Request validation
- Subscription checking
- File cleanup
- Response formatting

## Environment Variables

```env
GOOGLE_API_KEY=your_gemini_api_key
```

## Error Handling

The module provides detailed error messages:

- `NO_AUDIO_FILE`: Audio file is required
- `INVALID_FORMAT`: Unsupported audio format
- `FILE_TOO_LARGE`: File exceeds 20MB limit
- `AUDIO_TOO_LONG`: Duration exceeds maximum length
- `INVALID_TIMESTAMP`: Invalid timestamp format
- `PROCESSING_FAILED`: General processing error
- `USAGE_LIMIT_REACHED`: Subscription limit reached

## Integration with Conversations

All transcription activities are tracked in the conversation system:

- Each audio upload creates or updates a conversation
- Processing results are stored as messages
- Metadata includes file info, tokens, and processing type
- Guest users have limited conversation persistence

## Best Practices

1. **For large files**: Use the upload endpoint instead of inline
2. **Reusable audio**: Upload once and reference by URI for multiple operations
3. **Batch processing**: Group similar files to reduce API calls
4. **Timestamps**: Use MM:SS format for precise segment control
5. **Token management**: Monitor token usage for cost optimization
6. **Error handling**: Implement retry logic for transient failures

## Future Enhancements

- [ ] Support for SRT/VTT subtitle generation
- [ ] Real-time streaming transcription
- [ ] Speaker diarization
- [ ] Multi-language detection
- [ ] Custom vocabulary support
- [ ] Webhook notifications for long processing tasks

## Dependencies

- `@google/generative-ai` - Gemini API client
- `multer` - File upload handling
- `zod` - Request validation
- Conversation module integration
- Payment/subscription module integration
