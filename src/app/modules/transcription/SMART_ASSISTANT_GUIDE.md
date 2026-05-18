# Smart Transcription Assistant - API Guide

## 🎯 Single Unified Endpoint

The transcription module now uses **one smart endpoint** that automatically determines what to do based on your request:

```
POST /transcription/assistant
```

## 🧠 How It Works

The endpoint **smartly detects** what you want to do:

1. **Upload single audio file** → Transcribes/processes the audio
2. **Upload multiple audio files** → Batch processes all files
3. **Send text message** → Chats about previous transcriptions
4. **No file, no message** → Returns error

## 📤 Request Examples

### 1. Upload & Transcribe Audio (Form Data)

```javascript
const formData = new FormData();
formData.append('audio', audioFile); // Single file
formData.append('processingType', 'transcribe'); // Optional
formData.append('prompt', 'Please transcribe this');
formData.append('conversationId', 'optional-conversation-id');

const response = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: { Authorization: 'Bearer TOKEN' },
  body: formData,
});
```

### 2. Batch Upload Multiple Files (Form Data)

```javascript
const formData = new FormData();
formData.append('audios', file1); // Use 'audios' for multiple
formData.append('audios', file2);
formData.append('audios', file3);
formData.append('conversationId', 'optional-conversation-id');

const response = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: { Authorization: 'Bearer TOKEN' },
  body: formData,
});
```

### 3. Chat About Transcription (JSON)

```javascript
const response = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'What was discussed at the 2 minute mark?',
    conversationId: 'your-conversation-id', // Required for chat
  }),
});
```

### 4. Advanced Processing Options

```javascript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('processingType', 'analyze'); // Options: transcribe, describe, summarize, analyze, segment, question
formData.append('startTimestamp', '02:30'); // MM:SS format
formData.append('endTimestamp', '03:45');
formData.append('includeTimestamps', 'true');
formData.append('prompt', 'Focus on the speaker emotions');

const response = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: { Authorization: 'Bearer TOKEN' },
  body: formData,
});
```

## 📥 Response Format

### Audio Upload Response

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
      "estimatedDuration": 60
    },
    "conversationHistory": 2
  }
}
```

### Chat Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Chat message processed",
  "data": {
    "conversationId": "transcription-1234567890-abc",
    "result": "At the 2 minute mark, the speaker discusses...",
    "messageCount": 8,
    "hasAudioContext": true
  }
}
```

### Batch Upload Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Batch transcription completed",
  "data": {
    "conversationId": "transcription-1234567890-abc",
    "results": [
      {
        "fileName": "file1.mp3",
        "result": "Transcription of file 1...",
        "success": true
      },
      {
        "fileName": "file2.mp3",
        "result": "Transcription of file 2...",
        "success": true
      }
    ],
    "totalFiles": 2,
    "successCount": 2,
    "failureCount": 0
  }
}
```

## 🎨 Processing Types

| Type         | Description                | Example Use                 |
| ------------ | -------------------------- | --------------------------- |
| `transcribe` | Generate text transcript   | Convert speech to text      |
| `describe`   | Describe all audio content | "Describe sounds and music" |
| `summarize`  | Summarize main points      | "What's this about?"        |
| `analyze`    | Deep analysis of content   | "Identify themes and tone"  |
| `segment`    | Break into time segments   | "Split by topics"           |
| `question`   | Answer specific questions  | "Who are the speakers?"     |

## 💬 Chat Capabilities

After uploading audio, you can **chat about it**:

```javascript
// 1. Upload audio first
const formData = new FormData();
formData.append('audio', audioFile);
const uploadResponse = await fetch('/transcription/assistant', {
  method: 'POST',
  body: formData,
});
const { conversationId } = uploadResponse.data;

// 2. Now chat about it
const chatResponse = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversationId,
    message: 'What are the key takeaways?',
  }),
});

// 3. Continue conversation
const followUp = await fetch('/transcription/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversationId,
    message: 'Can you elaborate on the second point?',
  }),
});
```

## 🔑 Key Features

✅ **Smart Detection** - Automatically knows what to do  
✅ **Context-Aware** - Remembers conversation history  
✅ **Chat Enabled** - Ask questions about transcriptions  
✅ **Batch Support** - Process multiple files at once  
✅ **Timestamp Support** - Work with specific time ranges  
✅ **Guest Access** - Works without authentication  
✅ **File Cleanup** - Auto-deletes temp files

## 🚀 Quick Start Examples

### Simple Transcription

```bash
curl -X POST http://localhost:5000/transcription/assistant \
  -F "audio=@audio.mp3" \
  -F "processingType=transcribe"
```

### Batch Processing

```bash
curl -X POST http://localhost:5000/transcription/assistant \
  -F "audios=@file1.mp3" \
  -F "audios=@file2.mp3" \
  -F "audios=@file3.mp3"
```

### Chat Message

```bash
curl -X POST http://localhost:5000/transcription/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "your-conv-id",
    "message": "Summarize the main points"
  }'
```

## ⚙️ Configuration

| Parameter           | Type    | Default        | Description          |
| ------------------- | ------- | -------------- | -------------------- |
| `audio`             | File    | -              | Single audio file    |
| `audios`            | Files   | -              | Multiple audio files |
| `message`           | String  | -              | Chat message         |
| `processingType`    | String  | `transcribe`   | Processing type      |
| `conversationId`    | String  | auto-generated | Conversation ID      |
| `prompt`            | String  | -              | Custom instructions  |
| `startTimestamp`    | String  | -              | Start time (MM:SS)   |
| `endTimestamp`      | String  | -              | End time (MM:SS)     |
| `includeTimestamps` | Boolean | `false`        | Add timestamps       |
| `outputFormat`      | String  | `text`         | Output format        |

## 🔒 Authentication

**Optional** - Works with or without auth:

- **Authenticated**: Full features, tracked usage
- **Guest**: Limited features, temporary sessions

```javascript
// With auth
headers: { 'Authorization': 'Bearer YOUR_TOKEN' }

// Without auth (guest)
// No auth header needed
```

## 📊 Get Statistics

```
GET /transcription/stats
Authorization: Bearer YOUR_TOKEN
```

Returns:

```json
{
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
```

## 🎯 Use Cases

### 1. Meeting Transcription + Q&A

```javascript
// Transcribe meeting
const { conversationId } = await uploadAudio(meetingRecording);

// Ask questions
await chat(conversationId, 'What decisions were made?');
await chat(conversationId, 'List all action items');
```

### 2. Podcast Analysis

```javascript
// Upload episode
const { conversationId } = await uploadAudio(podcast);

// Analyze
await chat(conversationId, 'What are the main topics?');
await chat(conversationId, 'Who are the guests?');
```

### 3. Interview Processing

```javascript
// Batch upload interviews
await batchUpload([interview1, interview2, interview3]);

// Get insights
await chat(conversationId, 'Common themes across all interviews?');
```

## 🐛 Error Handling

```javascript
try {
  const response = await fetch('/transcription/assistant', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (data.success) {
    console.log('✅', data.data.result);
  } else {
    console.error('❌', data.message);
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

## 📝 Notes

- **Max file size**: 20MB per file
- **Max files**: 10 per batch request
- **Supported formats**: WAV, MP3, AIFF, AAC, OGG, FLAC
- **Max audio length**: 9.5 hours (guests: 5 minutes)
- **Token rate**: 32 tokens per second of audio
- **Conversation context**: Last 20 messages retained

## 🎉 That's It!

One endpoint, infinite possibilities! Just send your audio or message, and the smart assistant handles the rest.
