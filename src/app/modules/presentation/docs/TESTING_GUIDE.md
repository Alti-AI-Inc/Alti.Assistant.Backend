# Testing the GCS Upload Feature

## Prerequisites

1. **Google Cloud Storage Setup**
   ```bash
   # Ensure alti_gcp.json credentials file exists
   ls alti_gcp.json
   
   # Verify GCS bucket exists or create it
   gsutil ls gs://alti_presentation || gsutil mb gs://alti_presentation
   ```

2. **Environment Configuration**
   ```env
   # In .env file
   GCP_PROJECT_ID=your-project-id
   GOOGLE_APPLICATION_CREDENTIALS=alti_gcp.json
   GCS_PRESENTATION_BUCKET=alti_presentation
   ```

3. **Server Running**
   ```bash
   npm start
   # Server should be running on configured port (default: 3000)
   ```

4. **Presenton API Running**
   ```bash
   # Presenton API should be running on port 5000
   curl http://localhost:5000/health
   ```

## Test 1: Conversational API - New Presentation

### Request
```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a presentation about Artificial Intelligence with 5 slides"
  }'
```

### Expected Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation created successfully",
  "data": {
    "conversationId": "pres_1234567890_abc123",
    "success": true,
    "message": "🎉 Your presentation is ready!\n\n📊 Presentation ID: abc123\n🔗 Public URL: https://storage.googleapis.com/alti_presentation/user_id/conv_id/presentation_abc123.pptx\n📥 Download: http://localhost:5000/download/abc123\n✏️ Edit online: http://localhost:5000/edit/abc123\n💳 Credits used: 10",
    "presentationId": "abc123",
    "downloadUrl": "http://localhost:5000/download/abc123",
    "editUrl": "http://localhost:5000/edit/abc123",
    "publicUrl": "https://storage.googleapis.com/alti_presentation/...",
    "creditsConsumed": 10
  }
}
```

### Verification Steps
1. ✅ Check response contains `publicUrl` field
2. ✅ Verify URL format: `https://storage.googleapis.com/alti_presentation/...`
3. ✅ Access the `publicUrl` in browser - should download presentation
4. ✅ Check conversation in database:
   ```javascript
   db.conversations.findOne({ conversationId: "pres_..." })
   // Should have metadata.presentationUrl
   ```

## Test 2: Conversational API - Continue Conversation

### Request 1: Start
```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a presentation about Machine Learning"
  }'
```

### Request 2: Follow Up
```bash
# Use conversationId from previous response
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "10 slides, professional tone",
    "conversationId": "pres_1234567890_abc123"
  }'
```

### Expected Behavior
- First request: AI asks for more details (n_slides, etc.)
- Second request: Generates presentation with public URL
- Both requests use same `conversationId`

## Test 3: Direct API - Generate Presentation

### Request
```bash
curl -X POST http://localhost:3000/api/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Artificial Intelligence and Machine Learning",
    "n_slides": 8,
    "template": "modern",
    "theme": "professional-blue",
    "tone": "professional"
  }'
```

### Expected Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Presentation generated successfully",
  "data": {
    "presentation_id": "abc123",
    "path": "http://localhost:5000/download/abc123",
    "edit_path": "http://localhost:5000/edit/abc123",
    "publicUrl": "https://storage.googleapis.com/alti_presentation/direct_api/direct_1234567890/presentation_abc123.pptx",
    "credits_consumed": 10
  }
}
```

### Verification Steps
1. ✅ Response includes `publicUrl`
2. ✅ URL is accessible and downloads presentation
3. ✅ File exists in GCS at expected path

## Test 4: Edit Presentation

### Request
```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Edit presentation abc123 - change slide 2 to talk about neural networks",
    "conversationId": "pres_1234567890_abc123"
  }'
```

### Expected Response
- Success message with edited presentation details
- New `publicUrl` for edited version
- Conversation metadata updated with `editedPresentationUrl`

## Test 5: Derive Presentation

### Request
```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a new presentation from abc123 but focus on deep learning",
    "conversationId": "pres_1234567890_abc123"
  }'
```

### Expected Response
- Success message with new presentation details
- `publicUrl` for derived presentation
- Conversation metadata updated with `derivedPresentationUrl`

## Test 6: Guest User

### Request
```bash
curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a presentation about Cloud Computing with 7 slides"
  }'
```

### Expected Behavior
- Works without authentication
- Generates guest userId
- Creates conversation with guest flag
- Uploads to GCS with guest userId
- Returns public URL

## Test 7: Error Handling - GCS Failure

### Simulate GCS Failure
1. Temporarily rename `alti_gcp.json` to break GCS credentials
2. Make a presentation request
3. Should receive response with Presenton URLs but no public URL
4. Check logs for error message
5. Restore `alti_gcp.json`

### Expected Behavior
- Request succeeds despite GCS failure
- Response includes `downloadUrl` and `editUrl` from Presenton
- `publicUrl` is null or missing
- Error logged: "Error uploading presentation to GCS"

## Test 8: Verify File Structure in GCS

### Using gsutil
```bash
# List all files in bucket
gsutil ls -r gs://alti_presentation/

# Expected structure:
# gs://alti_presentation/user_id_1/conversation_id_1/presentation_abc123.pptx
# gs://alti_presentation/user_id_1/conversation_id_1/presentation_def456_edited.pptx
# gs://alti_presentation/direct_api/direct_1234567890/presentation_xyz789.pptx
```

### Using GCS Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/storage)
2. Navigate to `alti_presentation` bucket
3. Verify folder structure matches user/conversation pattern
4. Check file permissions (should be public)

## Test 9: Verify Metadata Storage

### Query Database
```javascript
// In MongoDB shell or via app
const conversation = await Conversation.findOne({ 
  conversationId: "pres_1234567890_abc123" 
});

console.log(conversation.metadata);

// Expected metadata:
{
  category: "presentation",
  model: "gemini-2.0-flash-exp",
  presentationUrl: "https://storage.googleapis.com/...",
  gcsPath: "userId/conversationId/presentation.pptx",
  uploadedAt: "2024-01-15T10:30:00.000Z",
  // If edited:
  editedPresentationUrl: "...",
  editedGcsPath: "...",
  editedAt: "..."
}
```

## Test 10: Performance Test

### Measure Upload Time
```bash
time curl -X POST http://localhost:3000/api/presentation/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a presentation about Data Science with 20 slides"}'
```

### Expected Performance
- Small presentations (5-10 slides): < 5 seconds total
- Medium presentations (10-20 slides): < 10 seconds total
- Large presentations (30+ slides): < 20 seconds total
- Upload should add minimal overhead (< 2 seconds)

## Test 11: Concurrent Requests

### Load Test Script
```bash
# Run 5 concurrent requests
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/presentation/assistant \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"Create presentation $i\"}" &
done
wait
```

### Expected Behavior
- All requests succeed
- Each gets unique conversation ID
- Files uploaded to separate paths
- No conflicts or race conditions

## Test 12: Using Test Script

### Run Automated Test
```bash
cd d:\ason\ASON-Core-Service-Backend
node scripts/test-gcs-upload.js
```

### Expected Output
```
🧪 Testing GCS Upload Service...

📤 Test 1: Uploading presentation to GCS...
✅ Upload successful!
📊 Upload Result: { ... }
🔗 Public URL: https://storage.googleapis.com/...
📁 GCS Path: test_user_123/test_conv_456/test_presentation.pptx
💾 File Size: 123456 bytes

🔍 Test 2: Verifying public URL is accessible...
✅ Public URL is accessible!
📄 Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
💾 Content-Length: 123456

🧹 Test 3: Cleaning up test file...
✅ Test file deleted successfully!

🎉 All tests passed!
✅ Test suite completed
```

## Troubleshooting

### Issue: "Failed to upload presentation to GCS"
**Solutions:**
1. Check `alti_gcp.json` exists and has correct permissions
2. Verify `GCP_PROJECT_ID` in `.env`
3. Check bucket exists: `gsutil ls gs://alti_presentation`
4. Verify service account has Storage Object Creator role

### Issue: "Public URL not accessible"
**Solutions:**
1. Check file permissions: `gsutil iam get gs://alti_presentation`
2. Make bucket publicly readable:
   ```bash
   gsutil iam ch allUsers:objectViewer gs://alti_presentation
   ```
3. Verify file is public: `gsutil acl get gs://alti_presentation/path/to/file.pptx`

### Issue: "No publicUrl in response"
**Solutions:**
1. Check server logs for upload errors
2. Verify upload didn't fail silently
3. Check if `path` exists in Presenton response
4. Test with simple request first

### Issue: "Wrong file path in GCS"
**Solutions:**
1. Check userId is being passed correctly
2. Verify conversationId generation
3. Check for special characters in IDs

## Success Criteria

✅ All presentations generate successfully
✅ Public URLs are included in responses
✅ Files are accessible via public URLs
✅ Files are organized correctly in GCS
✅ Metadata is saved to conversation
✅ System works for both guest and authenticated users
✅ Edit and derive operations upload correctly
✅ Graceful fallback when GCS fails
✅ No breaking changes to existing functionality

## Cleanup After Testing

```bash
# Delete test files from GCS
gsutil -m rm -r gs://alti_presentation/test_*
gsutil -m rm -r gs://alti_presentation/direct_api/

# Delete test conversations from database
db.conversations.deleteMany({ conversationId: /^pres_test/ })
```
