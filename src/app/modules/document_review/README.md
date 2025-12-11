# Document Review Module

A conversational AI-powered document review assistant that allows users to upload documents and receive intelligent reviews, feedback, and analysis.

## Features

- **Conversational Interface**: Natural language interaction for document review requests
- **Multiple Review Types**: Grammar check, content analysis, summary, improvements, fact-check, tone analysis, formatting review
- **File Upload Support**: Supports PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT files
- **Smart Context Management**: Maintains conversation history and context across multiple interactions
- **Flexible Review Depth**: Quick, standard, detailed, and comprehensive review levels
- **Document Type Specialization**: Tailored reviews for academic, business, technical, creative, legal, and marketing documents
- **Guest & Authenticated Users**: Works for both logged-in users and guests
- **Subscription-Aware**: Respects user usage limits and subscriptions

## API Endpoints

### 1. Conversational Assistant (Recommended)

**POST** `/api/v1/document-review/assistant`

Natural language interface for document review with file upload.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- message (required): User's message/request
- file (optional): Document file to review
- conversationId (optional): Continue existing conversation
- userId (optional): For guest users
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/v1/document-review/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.pdf" \
  -F "message=Can you review this document for grammar and clarity?"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "success": true,
    "conversationId": "review_1234567890_abc123",
    "response": "I've reviewed your document...",
    "documentInfo": {
      "filename": "document.pdf",
      "size": 102400,
      "contentLength": 5000
    },
    "reviewParams": {
      "reviewDepth": "standard",
      "documentType": "general",
      "aspects": ["grammar", "clarity"]
    },
    "needsFile": false,
    "needsMoreInfo": false
  }
}
```

### 2. Direct Review (Non-Conversational)

**POST** `/api/v1/document-review/review`

Direct document review with explicit parameters.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- file (required): Document file to review
- reviewType (optional): Type of review (general_review, grammar_check, content_analysis, etc.)
- reviewDepth (optional): quick, standard, detailed, comprehensive
- documentType (optional): academic, business, technical, creative, legal, marketing, general
- aspects (optional): Array of aspects to focus on
- additionalInstructions (optional): Specific instructions
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/v1/document-review/review \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@report.docx" \
  -F "reviewType=grammar_check" \
  -F "reviewDepth=detailed" \
  -F "documentType=business"
```

### 3. Get Conversation History

**GET** `/api/v1/document-review/conversation/:conversationId`

Retrieve conversation history for a specific review session.

**Example:**
```bash
curl -X GET http://localhost:5000/api/v1/document-review/conversation/review_1234567890_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Review Types

- **general_review**: Comprehensive review of the entire document
- **grammar_check**: Focus on grammar, spelling, and punctuation
- **content_analysis**: Analyze content quality, structure, and flow
- **summary**: Generate a concise summary of the document
- **suggest_improvements**: Provide specific improvement suggestions
- **fact_check**: Verify factual accuracy and identify claims
- **tone_analysis**: Analyze tone, voice, and style appropriateness
- **formatting_review**: Review formatting, layout, and organization

## Review Aspects

- **grammar**: Grammar and language usage
- **spelling**: Spelling accuracy
- **clarity**: Clarity and readability
- **coherence**: Logical flow and coherence
- **structure**: Document structure and organization
- **tone**: Tone and voice
- **formatting**: Visual formatting and presentation
- **factual_accuracy**: Factual correctness
- **completeness**: Content completeness
- **consistency**: Consistency throughout

## Review Depth Levels

- **quick**: Brief overview of main issues
- **standard**: Balanced review with key issues and suggestions (default)
- **detailed**: In-depth analysis with specific examples
- **comprehensive**: Most thorough analysis with extensive recommendations

## Document Types

- **academic**: Academic papers, essays, research documents
- **business**: Business reports, proposals, correspondence
- **technical**: Technical documentation, specifications
- **creative**: Creative writing, stories, articles
- **legal**: Legal documents, contracts (basic review)
- **marketing**: Marketing copy, promotional content
- **general**: General purpose documents (default)

## Supported File Types

- **PDF**: .pdf
- **Word**: .docx, .doc
- **Text**: .txt
- **Excel**: .xlsx, .xls (text extraction)
- **PowerPoint**: .pptx, .ppt (text extraction)

**Maximum file size**: 10MB

## Usage Examples

### Example 1: Simple Grammar Check
```javascript
const formData = new FormData();
formData.append('file', documentFile);
formData.append('message', 'Please check this document for grammar errors');

const response = await fetch('/api/v1/document-review/assistant', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### Example 2: Detailed Business Document Review
```javascript
const formData = new FormData();
formData.append('file', documentFile);
formData.append('message', 'I need a detailed review of this business proposal, focusing on clarity and structure');
formData.append('conversationId', existingConversationId); // Continue conversation

const response = await fetch('/api/v1/document-review/assistant', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### Example 3: Direct Review with Parameters
```javascript
const formData = new FormData();
formData.append('file', documentFile);
formData.append('reviewType', 'content_analysis');
formData.append('reviewDepth', 'comprehensive');
formData.append('documentType', 'academic');
formData.append('additionalInstructions', 'Pay special attention to argument strength');

const response = await fetch('/api/v1/document-review/review', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

## Conversational Flow

The assistant maintains context across multiple messages in a conversation:

1. **Upload document**: User uploads a file
2. **Initial review**: Assistant performs requested review
3. **Follow-up questions**: User asks follow-up questions about the review
4. **Refinement**: User can request different types of review on the same document
5. **Context retention**: Assistant remembers previous exchanges

Example conversation:
```
User: [uploads document] "Can you review this?"
Assistant: [performs general review]

User: "Can you focus more on the grammar?"
Assistant: [performs detailed grammar check on the same document]

User: "What about the tone?"
Assistant: [analyzes tone, referencing previous context]
```

## Error Handling

The API returns appropriate error messages:

- **400 Bad Request**: Invalid file type, missing required fields
- **403 Forbidden**: Usage limit reached
- **404 Not Found**: Conversation not found
- **500 Internal Server Error**: Processing errors

## Dependencies

- `@google/generative-ai`: For AI-powered review analysis
- `multer`: For file upload handling
- `pdf-parse`: For PDF text extraction
- `mammoth`: For DOCX text extraction
- `mongoose`: For conversation storage

## Configuration

Environment variables required:
```env
GEMINI_API_KEY=your_gemini_api_key
GCS_BUCKET_NAME=your_gcs_bucket (optional)
```

## Notes

- Reviews are context-aware and can reference previous conversation
- Uploaded files are temporarily stored and can be cleaned up after processing
- The module integrates with the existing conversation system
- Guest users have access but with limited features
- Subscription-based usage limits are enforced for authenticated users
