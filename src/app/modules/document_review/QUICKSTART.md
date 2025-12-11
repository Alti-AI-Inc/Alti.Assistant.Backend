# Document Review Module - Quick Start Guide

## Quick Setup

1. **Dependencies are already installed**
   - The module uses existing dependencies plus `pdf-parse` and `mammoth`
   - These have been added to package.json

2. **Environment Variables**
   Ensure these are set in your `.env` file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   GCS_BUCKET_NAME=your_bucket_name (optional)
   ```

3. **Module is already registered**
   - Routes are registered at `/api/v1/document-review`
   - No additional configuration needed

## Quick Test

### 1. Using cURL

**Upload and review a document:**
```bash
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@path/to/document.pdf" \
  -F "message=Please review this document for grammar and clarity"
```

**Continue conversation:**
```bash
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "message=Can you focus more on the tone?" \
  -F "conversationId=review_1234567890_abc123"
```

### 2. Using Postman

1. Import the collection from:
   `postman_collections/Document_Review_API.postman_collection.json`

2. Set variables:
   - `base_url`: http://localhost:5000/api/v1
   - `auth_token`: Your JWT token

3. Use the "Upload and Review Document" request

### 3. Using JavaScript/Fetch

```javascript
// Upload and review
const formData = new FormData();
formData.append('file', documentFile);
formData.append('message', 'Please review this document');

const response = await fetch('http://localhost:5000/api/v1/document-review/assistant', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(result.data.response); // AI review response
console.log(result.data.conversationId); // Save for follow-up
```

## Example Workflows

### Workflow 1: Grammar Check
```bash
# 1. Upload document
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -F "file=@essay.docx" \
  -F "message=Check for grammar errors"

# Response includes conversationId: "review_123"

# 2. Ask follow-up
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -F "message=What about spelling?" \
  -F "conversationId=review_123"
```

### Workflow 2: Business Document Review
```bash
# Direct review with parameters
curl -X POST http://localhost:5000/api/v1/document-review/review \
  -F "file=@proposal.pdf" \
  -F "reviewType=content_analysis" \
  -F "reviewDepth=comprehensive" \
  -F "documentType=business" \
  -F "additionalInstructions=Focus on executive summary"
```

### Workflow 3: Academic Paper
```bash
# Conversational approach
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -F "file=@research_paper.pdf" \
  -F "message=Review this academic paper. Focus on argument strength and citations."
```

## Common Use Cases

### Use Case 1: Quick Grammar Check
```
Message: "Check this for grammar errors"
```

### Use Case 2: Comprehensive Review
```
Message: "Give me a detailed review of this business proposal covering clarity, tone, and structure"
```

### Use Case 3: Content Improvement
```
Message: "How can I improve this document? What are the weak points?"
```

### Use Case 4: Summary Generation
```
Message: "Summarize this document for me"
```

### Use Case 5: Tone Analysis
```
Message: "Is the tone appropriate for a professional audience?"
```

## Supported File Types

- **PDF**: `.pdf`
- **Word**: `.docx`, `.doc`
- **Text**: `.txt`
- **Excel**: `.xlsx`, `.xls` (text extraction)
- **PowerPoint**: `.pptx`, `.ppt` (text extraction)

**Max file size**: 10MB

## Response Structure

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "success": true,
    "conversationId": "review_1702345678_abc123",
    "response": "I've reviewed your document. Here are my findings...",
    "documentInfo": {
      "filename": "document.pdf",
      "size": 102400,
      "contentLength": 5000
    },
    "reviewParams": {
      "reviewDepth": "standard",
      "documentType": "general",
      "aspects": ["grammar", "clarity", "structure"]
    },
    "needsFile": false,
    "needsMoreInfo": false
  }
}
```

## Error Handling

### No file uploaded
```json
{
  "success": true,
  "response": "Please upload a document file to review.",
  "needsFile": true
}
```

### Usage limit reached
```json
{
  "statusCode": 403,
  "success": false,
  "message": "You have reached your document review limit..."
}
```

## Testing Tips

1. **Start with a small document** (1-2 pages) for quick testing
2. **Test without auth first** (guest mode)
3. **Save conversationId** for follow-up requests
4. **Try different review types** to see varied responses
5. **Use Postman collection** for comprehensive testing

## Integration Example

```javascript
class DocumentReviewService {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async reviewDocument(file, message, conversationId = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message', message);
    if (conversationId) {
      formData.append('conversationId', conversationId);
    }

    const response = await fetch(`${this.baseUrl}/document-review/assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    return await response.json();
  }

  async continueConversation(message, conversationId) {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('conversationId', conversationId);

    const response = await fetch(`${this.baseUrl}/document-review/assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    return await response.json();
  }

  async getConversationHistory(conversationId) {
    const response = await fetch(
      `${this.baseUrl}/document-review/conversation/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }
    );

    return await response.json();
  }
}

// Usage
const service = new DocumentReviewService('http://localhost:5000/api/v1', token);

// Review document
const result = await service.reviewDocument(fileInput.files[0], 'Review this document');
console.log(result.data.response);

// Follow-up
const followUp = await service.continueConversation(
  'What about the tone?', 
  result.data.conversationId
);
```

## Next Steps

1. **Test the API** using Postman or cURL
2. **Try different review types** and depths
3. **Explore conversational features** with follow-up questions
4. **Check conversation history** endpoint
5. **Integrate into your frontend** application

## Troubleshooting

### Issue: "Failed to extract text from PDF"
- **Solution**: Ensure PDF is not password-protected or corrupted

### Issue: "File type not supported"
- **Solution**: Check file extension is in the supported list

### Issue: "Usage limit reached"
- **Solution**: Check user subscription status

### Issue: Module not found errors
- **Solution**: Ensure all dependencies are installed:
  ```bash
  npm install pdf-parse mammoth --legacy-peer-deps
  ```

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review the Postman collection for examples
3. Check logs in `logs/` directory
4. Verify environment variables are set correctly
