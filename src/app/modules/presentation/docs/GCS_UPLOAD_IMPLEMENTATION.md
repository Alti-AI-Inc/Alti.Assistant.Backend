# GCS Upload Integration - Implementation Summary

## Changes Made

### 1. Created GCS Upload Service

**File**: `src/app/modules/presentation/services/gcsUploadService.js`

**Features**:

- Download presentations from Presenton API
- Upload to Google Cloud Storage
- Organize files by userId/conversationId structure
- Make files publicly accessible
- Return public URLs
- Proper content-type mapping for PPTX, PDF, JSON

**Functions**:

- `uploadPresentationToGCS(presentonUrl, fileName, userId, conversationId)` - Main upload function
- `deleteFromGCS(gcsPath)` - Delete file from GCS

### 2. Updated Configuration

**File**: `config/index.js`

**Addition**:

```javascript
gcs: {
  knowledge_bank_bucket: 'alti_knowledge_bank_files',
  knowledgebot_bucket: 'alti_assistant_knowledge_bot_files',
  presentation_bucket: 'alti_assistant_presentation',  // NEW
}
```

### 3. Updated Presentation Service

**File**: `src/app/modules/presentation/presentation.service.js`

**Changes**:

- Added import for `uploadPresentationToGCS` and `path`
- Updated `handleGenerateIntent()` to upload sync-generated presentations
- Updated `handleEditIntent()` to upload edited presentations
- Updated `handleDeriveIntent()` to upload derived presentations

**For each function**:

1. Generate/Edit/Derive presentation via Presenton API
2. Upload file to GCS
3. Save public URL to conversation metadata
4. Include public URL in response message and return object
5. Continue even if upload fails (graceful degradation)

**Response Enhancements**:

- Added `publicUrl` field to return objects
- Updated response messages to include public URL
- Stored URL in conversation metadata

### 4. Updated Direct API Controller

**File**: `src/app/modules/presentation/presentation.controller.js`

**Changes**:

- Updated `generatePresentation()` controller
- Added GCS upload for synchronous generation
- Returns `publicUrl` in response data
- Uses `direct_api` as userId and `direct_{timestamp}` as conversationId

### 5. Updated Conversation Metadata Storage

**New Metadata Fields**:

```javascript
{
  presentationUrl: "https://storage.googleapis.com/.../presentation.pptx",
  gcsPath: "userId/conversationId/presentation.pptx",
  uploadedAt: "2024-01-15T10:30:00.000Z",

  editedPresentationUrl: "...",
  editedGcsPath: "...",
  editedAt: "...",

  derivedPresentationUrl: "...",
  derivedGcsPath: "...",
  derivedAt: "..."
}
```

### 6. Created Documentation

**Files Created**:

- `docs/GCS_UPLOAD_FEATURE.md` - Comprehensive feature documentation
- Updated `README.md` - Added GCS integration section

## API Response Changes

### Conversational API Response (Before)

```json
{
  "success": true,
  "message": "🎉 Your presentation is ready!...",
  "presentationId": "abc123",
  "downloadUrl": "http://localhost:5000/download/abc123",
  "editUrl": "http://localhost:5000/edit/abc123",
  "creditsConsumed": 10
}
```

### Conversational API Response (After)

```json
{
  "success": true,
  "message": "🎉 Your presentation is ready!\n\n📊 Presentation ID: abc123\n🔗 Public URL: https://storage.googleapis.com/alti_assistant_presentation/...\n📥 Download: http://localhost:5000/download/abc123\n✏️ Edit online: http://localhost:5000/edit/abc123\n💳 Credits used: 10",
  "presentationId": "abc123",
  "downloadUrl": "http://localhost:5000/download/abc123",
  "editUrl": "http://localhost:5000/edit/abc123",
  "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/...", // NEW
  "creditsConsumed": 10
}
```

### Direct API Response (Before)

```json
{
  "data": {
    "presentation_id": "abc123",
    "path": "http://localhost:5000/download/abc123",
    "edit_path": "http://localhost:5000/edit/abc123",
    "credits_consumed": 10
  }
}
```

### Direct API Response (After)

```json
{
  "data": {
    "presentation_id": "abc123",
    "path": "http://localhost:5000/download/abc123",
    "edit_path": "http://localhost:5000/edit/abc123",
    "publicUrl": "https://storage.googleapis.com/alti_assistant_presentation/...", // NEW
    "credits_consumed": 10
  }
}
```

## File Structure in GCS

```
alti_assistant_presentation/
  ├── user_id_1/
  │   ├── conversation_id_1/
  │   │   ├── presentation_abc123.pptx
  │   │   ├── presentation_def456_edited.pptx
  │   │   └── presentation_ghi789_derived.pptx
  │   └── conversation_id_2/
  │       └── presentation_xyz999.pptx
  └── direct_api/
      └── direct_1234567890/
          └── presentation_abc123.pptx
```

## Integration Points

### 1. Conversational Flow

```
User Message
  → Gemini Analysis
  → Handle Intent
  → Generate/Edit/Derive via Presenton API
  → Upload to GCS  ← NEW
  → Save URL to Conversation  ← NEW
  → Return Response with publicUrl  ← NEW
```

### 2. Direct API Flow

```
Direct API Request
  → Validate Parameters
  → Generate via Presenton API
  → Upload to GCS  ← NEW
  → Return Response with publicUrl  ← NEW
```

## Error Handling

### Graceful Degradation

If GCS upload fails:

- Error is logged
- Original Presenton download URL is still provided
- Response message excludes public URL section
- User can still download from Presenton
- System continues to function normally

### Error Logging

```javascript
logger.error('Error uploading presentation to GCS:', uploadError);
```

## Environment Variables Required

```env
# Existing
GCP_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=alti_gcp.json

# New (optional, defaults to 'alti_assistant_presentation')
GCS_PRESENTATION_BUCKET=alti_assistant_presentation
```

## Dependencies

All required dependencies already exist:

- `@google-cloud/storage` - GCS SDK
- `axios` - HTTP client for downloading files
- `path` - Path manipulation

## Testing

### Test the Upload Feature

1. **Via Conversational API**:

```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a presentation about AI"}'
```

2. **Via Direct API**:

```bash
curl -X POST http://localhost:3000/api/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{"content": "AI and ML", "n_slides": 5}'
```

3. **Verify in Response**:

- Check for `publicUrl` field
- Verify URL format: `https://storage.googleapis.com/alti_assistant_presentation/...`
- Access the URL to confirm file is downloadable

4. **Check Conversation Metadata**:

```javascript
// Fetch conversation
const conversation = await Conversation.findOne({ conversationId });
console.log(conversation.metadata.presentationUrl);
```

## Benefits

1. **Persistent Storage**: Files don't expire with Presenton session
2. **Fast Access**: CDN-backed GCS URLs for quick downloads
3. **Easy Sharing**: Public URLs can be shared anywhere
4. **Organization**: Structured by user and conversation for easy management
5. **History**: URLs stored in conversation for reference
6. **Reliability**: Fallback to Presenton URLs if upload fails

## Future Enhancements

Potential improvements:

- [ ] Private file access with signed URLs
- [ ] Automatic file cleanup/expiration policies
- [ ] File compression before upload
- [ ] Thumbnail generation for previews
- [ ] Version history tracking
- [ ] Batch upload optimization
- [ ] Upload progress tracking for large files

## Rollback Plan

If issues occur:

1. The system will fallback to Presenton URLs automatically
2. No breaking changes to existing API contracts
3. Can disable upload by catching errors at service level
4. Original functionality remains intact

## Monitoring

Log patterns to watch:

- `Presentation uploaded to GCS: {url}` - Success
- `Error uploading presentation to GCS: {error}` - Failure
- Monitor upload success rate
- Track GCS storage usage
