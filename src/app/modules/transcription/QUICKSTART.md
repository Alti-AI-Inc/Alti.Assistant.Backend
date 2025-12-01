# Transcription Module - Quick Start Guide

## ✅ Module Implemented Successfully

The Transcription module has been successfully implemented following the search module's architecture pattern with full Gemini Audio Understanding capabilities.

## 📁 Files Created

```
src/app/modules/transcription/
├── transcription.constant.js       # Constants and configuration
├── transcription.validation.js     # Zod validation schemas
├── transcription.service.js        # Business logic layer
├── transcription.controller.js     # Request handlers
├── transcription.route.js          # Route definitions
├── geminiAudioService.js           # Gemini API integration
└── README.md                       # Comprehensive documentation

uploads/audio/                      # Audio file storage
└── .gitignore                      # Ignore uploaded files

scripts/
└── test-transcription.js           # Test suite

postman_collections/
└── Transcription_API.postman_collection.json  # Postman collection
```

## 🚀 Getting Started

### 1. Environment Setup

Make sure you have the Gemini API key in your `.env` file:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

### 2. Install Dependencies (if needed)

The required packages should already be installed:
- `@google/generative-ai` ✅
- `multer` ✅
- `zod` ✅

### 3. Start the Server

```bash
npm run dev
```

The transcription endpoints will be available at:
```
http://localhost:5000/transcription/*
```

## 🧪 Testing

### Option 1: Run Test Script

1. Add a sample audio file to `test/data/sample.mp3`
2. Set your API key: `export API_KEY=your-token`
3. Run tests:

```bash
npm run test:transcription
```

### Option 2: Use Postman

1. Import the collection: `postman_collections/Transcription_API.postman_collection.json`
2. Set environment variables:
   - `baseUrl`: `http://localhost:5000`
   - `authToken`: Your authentication token
3. Test each endpoint

### Option 3: cURL Example

```bash
curl -X POST http://localhost:5000/transcription/transcribe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@/path/to/audio.mp3" \
  -F "processingType=transcribe" \
  -F "includeTimestamps=false"
```

## 🎯 Key Features

### Processing Types
1. **Transcribe** - Generate text transcripts
2. **Describe** - Describe audio content (sounds, music, speech)
3. **Summarize** - Create summaries
4. **Analyze** - Analyze themes, speakers, tone
5. **Segment** - Break into segments with timestamps
6. **Question** - Answer questions about content

### Audio Support
- WAV, MP3, AIFF, AAC, OGG, FLAC
- Up to 20MB per file
- Max 9.5 hours of audio
- 32 tokens per second

### User Support
- ✅ Authenticated users (full features)
- ✅ Guest users (limited features)
- ✅ Conversation tracking
- ✅ Usage statistics

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transcription/transcribe` | Upload & process audio file |
| POST | `/transcription/transcribe/inline` | Process base64 audio data |
| POST | `/transcription/transcribe/batch` | Process multiple files |
| POST | `/transcription/analyze/segments` | Analyze specific segments |
| GET | `/transcription/stats` | Get user statistics |

## 🔧 Configuration

### Rate Limits (in constants)
```javascript
TRANSCRIPTION_RATE_LIMITS = {
  TRANSCRIPTION_REQUESTS: { requests: 20, window: 15 }, // 20 per 15 min
  GUEST_REQUESTS: { requests: 5, window: 60 },          // 5 per hour
}
```

### File Limits
```javascript
MAX_INLINE_SIZE: 20MB
MAX_AUDIO_LENGTH: 9.5 hours
MAX_GUEST_AUDIO_LENGTH: 5 minutes
```

## 📝 Usage Examples

### Simple Transcription
```javascript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('processingType', 'transcribe');

const response = await fetch('/transcription/transcribe', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

### With Timestamps
```javascript
formData.append('startTimestamp', '02:30');
formData.append('endTimestamp', '03:29');
formData.append('prompt', 'Transcribe this segment');
```

### Describe Audio
```javascript
formData.append('processingType', 'describe');
formData.append('prompt', 'Describe all sounds and music');
```

## 🔍 Troubleshooting

### Common Issues

1. **No audio file found error**
   - Ensure file path is correct
   - Check file format (must be supported audio format)

2. **File too large**
   - Compress audio or use lower bitrate
   - Use Files API for files > 20MB

3. **Invalid timestamp format**
   - Use MM:SS format (e.g., "02:30")
   - Ensure timestamps are within audio duration

4. **API key not set**
   - Check `.env` file has `GOOGLE_API_KEY`
   - Restart server after updating env

5. **Rate limit exceeded**
   - Wait for rate limit window to reset
   - Check rate limit configuration in constants

## 📊 Response Format

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Audio processed successfully",
  "data": {
    "conversationId": "transcription-1234567890-abc",
    "result": "Transcribed text here...",
    "processingType": "transcribe",
    "metadata": {
      "fileName": "audio.mp3",
      "tokenCount": 1920,
      "estimatedDuration": 60,
      "model": "gemini-2.0-flash-exp"
    }
  }
}
```

## 🎨 Integration Points

### With Conversations Module
- All transcriptions create/update conversations
- History tracked for authenticated users
- Guest conversations have limited persistence

### With Payment/Subscription Module
- Usage limits checked for authenticated users
- Token counting for billing
- Statistics for usage tracking

## 🔐 Security

- ✅ Optional authentication (supports guests)
- ✅ File type validation
- ✅ File size limits
- ✅ Rate limiting per user type
- ✅ Temporary file cleanup
- ✅ Input validation with Zod

## 📈 Next Steps

1. **Test the endpoints** with sample audio files
2. **Monitor usage** through statistics endpoint
3. **Adjust rate limits** based on usage patterns
4. **Add custom features** as needed:
   - Custom vocabulary
   - Speaker identification
   - Multi-language support
   - Webhook notifications

## 🐛 Known Limitations

- No real-time streaming (batch processing only)
- Speaker diarization not yet implemented
- Language detection is automatic (not configurable)
- SRT/VTT format not fully implemented yet

## 📚 Additional Resources

- [Gemini Audio API Docs](https://ai.google.dev/gemini-api/docs/audio)
- Module README: `src/app/modules/transcription/README.md`
- Test Script: `scripts/test-transcription.js`
- Postman Collection: `postman_collections/Transcription_API.postman_collection.json`

## ✨ Features Implemented

✅ File upload transcription
✅ Inline audio processing
✅ Batch processing
✅ Segment analysis
✅ Multiple processing types
✅ Timestamp support
✅ Guest user access
✅ Conversation tracking
✅ Usage statistics
✅ Rate limiting
✅ Error handling
✅ File cleanup
✅ Token counting
✅ Comprehensive validation

---

**Module Status**: ✅ Production Ready

**Architecture**: Follows search module pattern
**API Version**: v1
**Last Updated**: November 27, 2025
