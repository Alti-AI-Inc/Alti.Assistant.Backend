# Document Drafting Module - Quick Start Guide

## Installation

No additional dependencies need to be installed - the module uses existing packages:

- `@google/generative-ai` (already installed)
- `pdfkit` (already installed)
- `@google-cloud/storage` (already installed)

## Setup

1. **Ensure Gemini API Key is configured**

   ```env
   GEMINI_SECRET_KEY=your-gemini-api-key
   ```

2. **(Optional) Configure Google Cloud Storage**

   ```env
   GCS_BUCKET_NAME=ason-documents
   GCP_PROJECT_ID=your-project-id
   GCS_KEY_FILE=/path/to/service-account-key.json
   ```

3. **Create output directory** (if not exists)
   ```bash
   mkdir -p output/documents
   ```

## Testing

### 1. Start the server

```bash
npm run dev
```

### 2. Test with simple request

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/v1/documents/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a professional cover letter for a software engineer position. Make it about 300 words and export as PDF."
  }'
```

**Using Postman:**

- Import the collection: `postman_collections/Document_Drafting_API.postman_collection.json`
- Set base_url variable: `http://localhost:5000/api/v1`
- Run "Start New Document Conversation" request

### 3. Test draft-first conversational flow

**Request 1: Minimal info**

```json
POST /api/v1/documents/assistant
{
  "message": "Write a business proposal about CRM implementation"
}
```

**Response:** Draft generated with refinement questions

```json
{
  "isDraft": true,
  "document": {
    "content": "...",
    "url": "https://storage.googleapis.com/..."
  },
  "improvementQuestions": [
    "What specific CRM features are most important?",
    "What's your budget range?",
    "What's the implementation timeline?"
  ],
  "message": "I've created a draft proposal for you...\n\nWould you like me to refine it?",
  "conversationId": "doc_xxx"
}
```

**Request 2: Provide refinement**

```json
POST /api/v1/documents/assistant
{
  "message": "Focus on sales automation. Budget is $75k. Timeline is 3 months.",
  "conversationId": "doc_xxx"
}
```

**Response:** Refined document generated

```json
{
  "isDraft": false,
  "document": {
    "content": "...",
    "url": "https://storage.googleapis.com/..."
  },
  "message": "I've updated your proposal with those details!"
}
```

### 4. Test direct generation

```bash
curl -X POST http://localhost:5000/api/v1/documents/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Write a blog post about AI trends in 2025",
    "documentType": "blog_post",
    "outputFormat": "html",
    "tone": "casual",
    "length": "medium"
  }'
```

## Common Use Cases

### Use Case 1: Cover Letter

```javascript
{
  "message": "Write a professional cover letter for a Senior Developer position at Google. Highlight 7 years of experience in React and Node.js. Export as PDF."
}
```

### Use Case 2: Business Report

```javascript
{
  "content": "Quarterly sales report for Q4 2024. Include revenue analysis, top performing products, and market trends.",
  "documentType": "report",
  "outputFormat": "pdf",
  "tone": "professional",
  "length": "long"
}
```

### Use Case 3: Technical Documentation

```javascript
{
  "content": "API documentation for user authentication endpoints. Include OAuth 2.0 flow, token management, and security best practices.",
  "documentType": "technical_doc",
  "outputFormat": "html",
  "tone": "technical",
  "template": "technical_documentation"
}
```

### Use Case 4: Academic Essay

```javascript
{
  "message": "Write an academic essay about climate change impacts on agriculture. 1500 words, academic tone, include citations format."
}
```

## Checking Generated Documents

Generated documents are saved in:

- **Local:** `output/documents/`
- **GCS:** Available via URL in response

Example response structure:

```json
{
  "document": {
    "content": "Full text content...",
    "format": "pdf",
    "file": {
      "filePath": "d:\\ason\\output\\documents\\document_1234567890.pdf",
      "fileName": "document_1234567890.pdf",
      "format": "pdf",
      "size": 45678
    },
    "url": "https://storage.googleapis.com/ason-documents/documents/...",
    "metadata": {
      "title": "Document Title",
      "documentType": "proposal"
    }
  }
}
```

## Available Endpoints

| Endpoint                      | Method | Description                            |
| ----------------------------- | ------ | -------------------------------------- |
| `/api/v1/documents/assistant` | POST   | Conversational interface (recommended) |
| `/api/v1/documents/generate`  | POST   | Direct generation with all params      |
| `/api/v1/documents/export`    | POST   | Export to different format             |
| `/api/v1/documents/edit`      | POST   | Edit existing document                 |

## Supported Formats

- **PDF** - Most common, fully supported ✅
- **TXT** - Plain text ✅
- **HTML** - Web format ✅
- **MD** - Markdown ✅
- **DOCX** - Word format (simplified, needs enhancement) ⚠️
- **DOC** - Legacy Word format (simplified) ⚠️

## Tips for Best Results

1. **Start with minimal info - let it draft first!**

   - Good: "Write a cover letter for software engineer position"
   - The system will create a draft and ask refinement questions
   - You don't need to provide all details upfront

2. **Use the refinement questions**

   - After getting the draft, answer the suggested questions
   - This helps improve the document iteratively
   - You can skip questions or provide free-form feedback

3. **Conversational assistant is the main interface**

   - It generates drafts quickly with minimal info
   - Then offers targeted questions for improvement
   - Continue the conversation to refine

4. **Use direct generation when you have complete requirements**

   - Faster for repeated tasks
   - Better for programmatic access
   - Bypasses the draft-refine flow

5. **Specify tone and length when you know them**
   - Tone affects writing style significantly
   - Length helps control document size
   - But you can always refine these later

## Troubleshooting

### Issue: Documents not generating

- Check Gemini API key is configured
- Check output directory exists
- Check server logs for errors

### Issue: Files not uploading to GCS

- Verify GCS credentials are configured
- Check bucket name is correct
- Documents will still save locally as fallback

### Issue: AI asking too many questions

- Provide more details in initial message
- Use direct generation endpoint instead
- Specify all parameters upfront

### Issue: Generated content too short/long

- Explicitly specify word count
- Use length parameter: short/medium/long
- Add instruction: "Make it approximately X words"

## Next Steps

1. Test with various document types
2. Experiment with different tones
3. Try conversational flow
4. Test with authenticated users
5. Set up GCS for production
6. Configure rate limits as needed

## Support

For issues or questions:

- Check README.md for detailed documentation
- Review error logs in `logs/errors/`
- Test with Postman collection
- Verify environment variables

## Production Considerations

Before deploying to production:

1. ✅ Configure GCS properly
2. ✅ Set appropriate rate limits
3. ⚠️ Enhance DOCX export using 'docx' package
4. ✅ Enable authentication
5. ✅ Set up monitoring
6. ✅ Configure backup storage
7. ✅ Test with high load
