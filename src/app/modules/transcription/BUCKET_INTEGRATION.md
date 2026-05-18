# Transcription Bucket Storage Integration

## Overview

Audio files uploaded for transcription are now **automatically saved to the `alti_assistant_transcription` GCP bucket** for permanent storage. This allows you to:

- Access original audio files later
- Re-process audio without re-uploading
- Share audio files with users
- Maintain audio archives for compliance
- **Use `gs://` URIs directly with Gemini** (no File API upload needed!)

## How It Works

### Upload Flow

```
User uploads audio → Save to GCS bucket → Use gs:// URI in Gemini → Process → Store results
                     ↓
                  gs://alti_assistant_transcription/transcriptions/
                     ├─ timestamp-audio1.mp3
                     ├─ timestamp-audio2.wav
                     └─ ...
```

### Storage Details

**Bucket:** `alti_assistant_transcription` (Google Cloud Storage)  
**Access:** Private (requires signed URLs for external access)  
**Naming:** `transcriptions/{timestamp}-{originalName}`  
**GCS URI:** `gs://alti_assistant_transcription/transcriptions/{filename}`  
**Public URL:** `https://storage.googleapis.com/alti_assistant_transcription/transcriptions/{filename}`

## Conversation Metadata

Each audio upload message now includes:

```json
{
  "metadata": {
    "type": "audio_upload",
    "fileName": "meeting.mp3",
    "fileSize": 5242880,
    "mimeType": "audio/mp3",
    "fileUri": "https://generativelanguage.googleapis.com/v1beta/files/xyz",
    "gsUri": "gs://alti_assistant_transcription/transcriptions/1732723200-meeting.mp3",
    "gcsFileName": "transcriptions/1732723200-meeting.mp3",
    "bucketName": "alti_assistant_transcription",
    "processingType": "transcribe"
  }
}
```

## Accessing Stored Audio

### 1. Get Audio URL from Conversation

```javascript
// Get conversation
const conversation =
  await conversationHelpers.getConversationById(conversationId);

// Find audio upload message
const audioMessage = conversation.messages.find(
  (msg) => msg.metadata?.type === 'audio_upload'
);

const gsUri = audioMessage.metadata.gsUri;
const gcsFileName = audioMessage.metadata.gcsFileName;
```

### 2. Generate Signed URL (for private access)

```javascript
import { bucketUploadService } from './bucketUpload.service.js';

// Generate URL valid for 1 hour
const signedUrl = await bucketUploadService.getSignedUrl(gcsFileName, 3600);

// Return to user
res.json({ audioUrl: signedUrl });
```

### 3. Check if Audio Exists

```javascript
const exists = await bucketUploadService.audioExistsInBucket(gcsFileName);
if (exists) {
  // Audio is available
}
```

### 4. Get Audio Metadata

```javascript
const metadata = await bucketUploadService.getAudioMetadata(gcsFileName);
console.log(metadata);
// {
//   size: 5242880,
//   mimeType: 'audio/mp3',
//   created: '2025-11-27T16:00:00Z',
//   updated: '2025-11-27T16:00:00Z',
//   gsUri: 'gs://alti_assistant_transcription/transcriptions/meeting.mp3',
//   metadata: { originalName: 'meeting.mp3', ... }
// }
```

## Bucket Service API

### `uploadAudioToBucket(filePath, originalName, mimeType)`

Uploads audio file to bucket.

**Returns:**

```javascript
{
  gsUri: 'gs://alti_assistant_transcription/transcriptions/...',  // GCS URI for Gemini
  publicUrl: 'https://storage.googleapis.com/...',  // Public URL
  fileName: 'transcriptions/1234-meeting.mp3',  // GCS file path
  originalName: 'meeting.mp3',
  bucketName: 'alti_assistant_transcription',
  mimeType: 'audio/mp3',
  size: 5242880
}
```

### `getSignedUrl(fileName, expiresIn)`

Generates temporary access URL for private files.

**Parameters:**

- `fileName` - GCS file path from metadata
- `expiresIn` - Seconds until expiration (default: 3600 = 1 hour)

**Returns:** Signed URL string

### `deleteAudioFromBucket(fileName)`

Deletes audio file from GCS bucket (for cleanup).

### `audioExistsInBucket(fileName)`

Checks if audio file exists in bucket.

**Returns:** `true` or `false`

### `getAudioMetadata(fileName)`

Gets file metadata without downloading.

## Use Cases

### 1. Re-process Audio

```javascript
// Get bucket key from conversation
const bucketKey = audioMessage.metadata.bucketKey;

// Check if exists
if (await bucketUploadService.audioExistsInBucket(bucketKey)) {
  // Get signed URL
  const url = await bucketUploadService.getSignedUrl(bucketKey);

  // Download and re-process
  const audioBuffer = await downloadFromUrl(url);
  // Process with different settings...
}
```

### 2. Share Audio with Users

```javascript
// Generate 24-hour access link
const shareUrl = await bucketUploadService.getSignedUrl(
  bucketKey,
  86400 // 24 hours
);

res.json({
  message: 'Audio file shared',
  audioUrl: shareUrl,
  expiresIn: '24 hours',
});
```

### 3. Export Transcription with Audio

```javascript
const transcription = {
  text: result.text,
  audioUrl: await bucketUploadService.getSignedUrl(bucketKey),
  timestamp: new Date(),
  processingType: 'transcribe',
};
```

### 4. Cleanup Old Audio Files

```javascript
// Get old conversations
const oldConversations = await Conversation.find({
  createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // 90 days
});

// Delete audio files
for (const conv of oldConversations) {
  for (const msg of conv.messages) {
    if (msg.metadata?.bucketKey) {
      await bucketUploadService.deleteAudioFromBucket(msg.metadata.bucketKey);
    }
  }
}
```

## Future: Direct GCS Integration

Currently using DigitalOcean Spaces (S3-compatible). For Google Cloud Storage:

**Benefits:**

- Gemini can read `gs://bucket/file` URIs directly
- No need to upload to File API
- Faster processing

**Implementation:**

```javascript
// Instead of uploading to Gemini File API
const bucketUrl = `gs://your-gcs-bucket/alti_assistant_transcription/${filename}`;

// Use directly in Gemini
const result = await geminiAudioService.processAudioWithGemini(
  { fileUri: bucketUrl, mimeType: 'audio/mp3' },
  prompt,
  processingType
);
```

**Requirements:**

- GCS bucket in same Google Cloud project as Gemini API key
- Proper IAM permissions
- Update `bucketUpload.service.js` to use GCS SDK instead of S3

## Configuration

Bucket settings are in `config/index.js`:

```javascript
{
  cloud_storage_access_key: process.env.CLOUD_STORAGE_ACCESS_KEY,
  cloud_storage_secret_key: process.env.CLOUD_STORAGE_SECRET_KEY,
  cloud_storage_bucket: process.env.CLOUD_STORAGE_BUCKET
}
```

## File Structure

```
alti_assistant_transcription/
├── 1732723200123-meeting.mp3
├── 1732723201456-interview.wav
├── 1732723202789-podcast.mp3
└── ...
```

Each file is named: `{timestamp}-{originalFileName}`

## Security

- **ACL:** Private by default
- **Access:** Requires signed URLs
- **Expiration:** URLs expire after specified time
- **Metadata:** Stored in conversation messages (not public)

## Cost Optimization

**Storage:** ~$0.02/GB/month (DigitalOcean Spaces)  
**Bandwidth:** ~$0.01/GB (outbound)

**Tips:**

- Set lifecycle rules to delete files after X days
- Use lower bitrate for long-term storage
- Compress audio files before upload
- Delete processed files if not needed

## Testing

```javascript
// Test upload
const result = await bucketUploadService.uploadAudioToBucket(
  './test-audio.mp3',
  'test-audio.mp3',
  'audio/mp3'
);
console.log('Uploaded:', result.bucketUrl);

// Test signed URL
const url = await bucketUploadService.getSignedUrl(result.bucketKey);
console.log('Signed URL:', url);

// Test exists
const exists = await bucketUploadService.audioExistsInBucket(result.bucketKey);
console.log('Exists:', exists);

// Test delete
await bucketUploadService.deleteAudioFromBucket(result.bucketKey);
console.log('Deleted');
```

## Summary

✅ **Automatic upload** - Every audio file is saved to bucket  
✅ **Permanent storage** - Audio available after processing  
✅ **Private by default** - Secure with signed URLs  
✅ **Conversation integration** - URLs stored in metadata  
✅ **Future-ready** - Can switch to GCS for direct Gemini access  
✅ **Cost-effective** - Minimal storage costs

Audio files are now safely stored and accessible whenever needed!
