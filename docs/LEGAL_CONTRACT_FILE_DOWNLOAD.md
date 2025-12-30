# Legal Contract File Download Feature

## Overview
This feature allows users to generate and download legal contracts as files, with automatic upload to Google Cloud Storage (GCS) and public URL generation.

## Architecture

### Components

1. **GCS Upload Service** (`services/gcsUploadService.js`)
   - Uploads contract files to GCS bucket: `alti_assistant_documents`
   - Folder structure: `contract/{userId}/{filename}`
   - Generates public URLs for downloads
   - Fallback to local storage if GCS not configured

2. **File Generation Service** (`services/fileGenerationService.js`)
   - Creates contract files in TXT format (DOCX coming soon)
   - Saves to `output/contracts/` directory
   - Handles file cleanup after upload

3. **Download Intent Detection** (AI-powered)
   - Uses Gemini AI to understand user intent
   - Detects file download requests from natural language
   - Identifies desired format (txt, docx, pdf)

## Usage Flow

### 1. User Requests Download

Users can request file downloads in various ways:
- "make it a file"
- "give me a download link"
- "can I download this?"
- "export as docx"
- "send me a pdf"

### 2. AI Detection

The system uses `detectDownloadIntent()` function to:
- Analyze user message with Gemini AI
- Determine if file download is requested
- Identify desired format
- Fallback to keyword detection if AI fails

### 3. File Generation

When download is detected:
1. Contract content is saved to a local file
2. File is uploaded to GCS bucket
3. Public URL is generated
4. Local file is cleaned up (if upload succeeds)

### 4. Response

User receives:
- Public download URL
- File name
- Format information
- Contract content (if needed)

## API Integration

### Conversational Request

The main flow in `processConversationalRequest()` now includes:

**Scenario 3: Download Request**
```javascript
if (downloadIntent.wantsFile && currentContract) {
  const fileUploadResult = await generateAndUploadContractFile(
    currentContract,
    userId,
    {
      format: downloadIntent.format,
      contractType: existingParams.contractType,
      conversationId: actualConversationId,
    }
  );
  
  // Return download link
}
```

## Configuration

### GCS Settings

Set these environment variables:
```bash
GCS_BUCKET_NAME=alti_assistant_documents
GCP_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json
```

### Folder Structure

GCS folder structure:
```
alti_assistant_documents/
  contract/
    {userId}/
      employment_1234567890.txt
      nda_1234567891.txt
```

Local output:
```
output/
  contracts/
    employment_1234567890.txt
```

## File Formats

### Currently Supported
- **TXT** - Plain text format (default)

### Coming Soon
- **DOCX** - Microsoft Word format (requires `docx` library)
- **PDF** - PDF format (requires PDF generation library)

## Example Responses

### Successful Download Request

**User:** "give me a download link"

**Response:**
```
Here's your contract file!

Download Link: https://storage.googleapis.com/alti_assistant_documents/contract/user123/employment_1735500000.txt

File Name: employment_1735500000.txt
Format: TXT

[Legal disclaimer...]
```

### When Contract is Complete

After all enhancement questions:
```
Contract fully enhanced!

FINAL CONTRACT:
[contract content...]

---

All enhancement questions have been answered. Your contract is complete! 
Say "give me a download link" or "make it a file" to get a downloadable version.
```

## Error Handling

### GCS Not Configured
- Falls back to local storage
- Returns local file path
- Logs warning message

### File Generation Failure
- Returns error message
- Logs detailed error
- Contract text still available

### Upload Failure
- Keeps local file
- Returns local path
- Logs error for investigation

## Testing

### Test Download Intent Detection

```javascript
const intent = await detectDownloadIntent("give me a pdf");
// Returns: { wantsFile: true, format: 'pdf' }

const intent2 = await detectDownloadIntent("update the contract");
// Returns: { wantsFile: false, format: 'none' }
```

### Test File Generation

```javascript
const result = await generateAndUploadContractFile(
  contractContent,
  userId,
  {
    format: 'txt',
    contractType: 'employment',
    conversationId: 'contract_123',
  }
);
// Returns public URL and file info
```

## Security Considerations

### Public URLs
- Files are made publicly accessible
- Anyone with the URL can download
- No authentication required
- URLs are long and random (hard to guess)

### Future Enhancements
- Add signed URLs with expiration
- Implement access control
- Add download tracking
- Support private file sharing

## Monitoring

### Key Metrics
- Download request detection accuracy
- GCS upload success rate
- File generation errors
- Storage usage

### Logs
- File upload operations
- Download intent decisions
- Error tracking
- User download patterns

## API Response Format

```json
{
  "success": true,
  "conversationId": "contract_1735500000_abc123",
  "response": "Contract file generated and ready for download!",
  "contract": "...",
  "contractGenerated": true,
  "fileGenerated": true,
  "downloadLink": "https://storage.googleapis.com/...",
  "fileName": "employment_1735500000.txt",
  "format": "txt"
}
```

## Future Enhancements

### Planned Features
1. **DOCX Generation** - Full Microsoft Word support with formatting
2. **PDF Generation** - Professional PDF documents
3. **Template Support** - Pre-designed contract templates
4. **Batch Download** - Download multiple versions
5. **Version History** - Track contract revisions
6. **Email Delivery** - Send contracts via email
7. **Digital Signatures** - Integration with signature services

### Infrastructure
- CDN integration for faster downloads
- Automatic file expiration/cleanup
- Download analytics dashboard
- Rate limiting for downloads

## Troubleshooting

### Common Issues

**Issue:** "GCS not configured"
- **Solution:** Set environment variables for GCS credentials

**Issue:** "File not uploading"
- **Solution:** Check GCS bucket permissions and authentication

**Issue:** "Download intent not detected"
- **Solution:** Use explicit keywords like "download" or "file"

**Issue:** "Local file not cleaned up"
- **Solution:** Check file permissions and disk space

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review GCS bucket permissions
- Verify environment configuration
- Test with explicit download keywords
