# Google Cloud Storage Upload Feature

## Overview

The presentation module now automatically uploads generated presentations to Google Cloud Storage (GCS) and provides public URLs for easy access and sharing.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# GCS Configuration
GCP_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=alti_gcp.json
GCS_PRESENTATION_BUCKET=alti_assistant_presentation
```

### GCS Bucket

The module uses the `alti_assistant_presentation` bucket (configurable via `GCS_PRESENTATION_BUCKET` env var).

**Bucket Structure:**

```
alti_assistant_presentation/
  ├── {userId}/
  │   ├── {conversationId}/
  │   │   ├── presentation_{id}.pptx
  │   │   ├── presentation_{id}_edited.pptx
  │   │   └── presentation_{id}_derived.pptx
```

## Features

### Automatic Upload

When a presentation is generated, edited, or derived:

1. **Download from Presenton API** - The file is fetched from the Presenton API URL
2. **Upload to GCS** - Uploaded to the appropriate bucket path
3. **Make Public** - File is made publicly accessible
4. **Save URL** - Public URL is saved to conversation metadata
5. **Return in Response** - URL is included in the API response

### Supported Operations

All presentation operations now include GCS upload:

- **Generate Presentation** - New presentations are uploaded
- **Edit Presentation** - Edited versions are uploaded
- **Derive Presentation** - Derived presentations are uploaded

### Error Handling

If GCS upload fails:

- The error is logged but doesn't block the response
- Users still receive the Presenton download URL
- The system continues to function normally

## API Response Structure

### Conversational API Response

```json
{
  "success": true,
  "message": "🎉 Your presentation is ready!\n\n📊 Presentation ID: abc123\n🔗 Public URL: https://storage.googleapis.com/alti_assistant_presentation/user123/conv456/presentation_abc123.pptx\n📥 Download: http://localhost:5000/download/abc123\n✏️ Edit online: http://localhost:5000/edit/abc123\n💳 Credits used: 10",
  "conversationId": "pres_1234567890_abc123",
  "presentationId": "abc123",
  "downloadUrl": "http://localhost:5000/download/abc123",
  "editUrl": "http://localhost:5000/edit/abc123",
  "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/user123/conv456/presentation_abc123.pptx",
  "creditsConsumed": 10
}
```

### Direct API Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Presentation generated successfully",
  "data": {
    "presentation_id": "abc123",
    "path": "http://localhost:5000/download/abc123",
    "edit_path": "http://localhost:5000/edit/abc123",
    "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/direct_api/direct_1234567890/presentation_abc123.pptx",
    "credits_consumed": 10
  }
}
```

## Conversation Metadata

Presentation URLs are stored in conversation metadata:

```javascript
{
  metadata: {
    // ... other metadata
    presentationUrl: "https://storage.googleapis.com/alti_assistant_presentation/.../presentation.pptx",
    gcsPath: "userId/conversationId/presentation.pptx",
    uploadedAt: "2024-01-15T10:30:00.000Z",

    // For edited presentations
    editedPresentationUrl: "https://...",
    editedGcsPath: "...",
    editedAt: "2024-01-15T11:00:00.000Z",

    // For derived presentations
    derivedPresentationUrl: "https://...",
    derivedGcsPath: "...",
    derivedAt: "2024-01-15T11:30:00.000Z"
  }
}
```

## File Organization

Files are organized by:

1. **User ID** - Separates files by user
2. **Conversation ID** - Groups files from the same conversation
3. **File Name** - Descriptive names with presentation ID

## Content Types

The system automatically sets correct content types:

- `.pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `.pdf` → `application/pdf`
- `.json` → `application/json`

## Public Access

All uploaded files are made publicly accessible via:

- Direct URL: `https://storage.googleapis.com/{bucket}/{path}`
- No authentication required for access
- URLs can be shared with anyone

## Service Integration

### GCS Upload Service

Located at: `src/app/modules/presentation/services/gcsUploadService.js`

**Main Functions:**

```javascript
// Upload presentation to GCS
await uploadPresentationToGCS(
  presentonUrl, // URL from Presenton API
  fileName, // Name for the file
  userId, // User ID
  conversationId // Conversation ID
);

// Delete file from GCS
await deleteFromGCS(gcsPath);
```

### Integration in Service Layer

The upload is integrated in:

- `handleGenerateIntent()` - For new presentations
- `handleEditIntent()` - For edited presentations
- `handleDeriveIntent()` - For derived presentations

### Integration in Controller Layer

Direct API endpoint also includes upload functionality in `generatePresentation()` controller.

## Usage Examples

### Conversational API

```javascript
// Generate with auto-upload
POST /api/presentation/conversational
{
  "message": "Create a presentation about AI",
  "conversationId": "conv_123"
}

// Response includes publicUrl
{
  "success": true,
  "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/..."
}
```

### Direct API

```javascript
// Generate with auto-upload
POST /api/presentation/generate
{
  "content": "AI and Machine Learning",
  "n_slides": 10
}

// Response includes publicUrl in data
{
  "data": {
    "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/..."
  }
}
```

## Benefits

1. **Permanent Storage** - Files persist beyond Presenton API session
2. **Fast Access** - Direct CDN-backed access via GCS
3. **Easy Sharing** - Public URLs can be shared anywhere
4. **Organization** - Structured by user and conversation
5. **Tracking** - URLs stored in conversation history
6. **Reliability** - Fallback to Presenton URLs if upload fails

## Security Considerations

- Files are made **publicly accessible** - consider this for sensitive content
- GCS credentials should be properly secured
- Bucket permissions should be reviewed regularly
- Consider implementing file expiration policies

## Monitoring

Check logs for upload status:

- Success: `Presentation uploaded to GCS: {url}`
- Failure: `Error uploading presentation to GCS: {error}`

## Future Enhancements

Potential improvements:

- Private file access with signed URLs
- Automatic file cleanup/expiration
- File compression before upload
- Thumbnail generation
- Version history tracking
