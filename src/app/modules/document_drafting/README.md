# Document Drafting Module

This module provides AI-powered document drafting capabilities with conversational interface and support for multiple output formats.

## Features

- 🚀 **Draft-First Approach**: Generates documents quickly with minimal info, then offers refinements
- 🤖 **Conversational Interface**: Natural language document generation through chat
- 📄 **Multiple Document Types**: Support for various document types (letters, essays, reports, proposals, etc.)
- 💾 **Multiple Export Formats**: PDF, DOCX, DOC, TXT, HTML, Markdown
- 🎨 **Customizable Tone**: Professional, casual, formal, friendly, academic, creative, persuasive, technical
- 📏 **Flexible Length**: Short, medium, long, or custom word count
- 🔄 **Iterative Refinement**: Generate draft, then improve based on your feedback
- 🔄 **Conversation Context**: Maintains context across messages
- 👤 **Guest & Authenticated Users**: Supports both user types
- ☁️ **Cloud Storage**: Optional GCS integration for document storage

## API Endpoints

### 1. Conversational Assistant (Recommended)

**POST** `/api/v1/documents/assistant`

Natural language interface for document creation. The AI understands your intent and asks clarifying questions.

**Request Body:**
```json
{
  "message": "I need to write a professional business proposal for a new software project",
  "conversationId": "optional-conversation-id",
  "userId": "optional-for-guest-users"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "doc_1234567890_abc123",
    "userId": "user123",
    "success": true,
    "needsMoreInfo": false,
    "isDraft": true,
    "message": "I've created a draft business proposal for you in PDF format.\n\nWould you like me to refine it? I can improve the document if you answer these questions:\n\n1. What specific features or benefits should I highlight?\n2. What's your target audience or customer profile?\n3. What's the proposed timeline and budget range?\n\nFeel free to answer any or all of these questions, or just tell me what you'd like to change!",
    "document": {
      "content": "Full document text...",
      "format": "pdf",
      "file": {
        "filePath": "/path/to/document.pdf",
        "fileName": "document_1234567890.pdf",
        "format": "pdf",
        "size": 45678
      },
      "url": "https://storage.googleapis.com/...",
      "metadata": {
        "title": "Business Proposal",
        "documentType": "proposal",
        "includeDate": true,
        "includeTitle": true
      }
    },
    "improvementQuestions": [
      "What specific features or benefits should I highlight?",
      "What's your target audience or customer profile?",
      "What's the proposed timeline and budget range?"
    ],
    "collectedParams": {
      "content": "proposal for new software project",
      "documentType": "proposal",
      "tone": "professional",
      "outputFormat": "pdf"
    }
  }
}
```

### 2. Direct Document Generation

**POST** `/api/v1/documents/generate`

Generate documents with all parameters provided upfront.

**Request Body:**
```json
{
  "content": "Write a technical documentation for REST API implementation",
  "documentType": "technical_doc",
  "outputFormat": "pdf",
  "tone": "technical",
  "length": "long",
  "wordCount": 2000,
  "includeTitle": true,
  "includeDate": true,
  "language": "en",
  "template": "technical_documentation",
  "additionalInstructions": "Include code examples and best practices"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Document generated successfully",
  "data": {
    "success": true,
    "document": {
      "content": "Full document text...",
      "format": "pdf",
      "file": {
        "filePath": "/path/to/document.pdf",
        "fileName": "document_1234567890.pdf",
        "format": "pdf",
        "size": 78901
      },
      "url": "https://storage.googleapis.com/...",
      "metadata": {
        "title": "Technical Documentation",
        "documentType": "technical_doc",
        "includeDate": true,
        "includeTitle": true
      }
    }
  }
}
```

### 3. Export Document

**POST** `/api/v1/documents/export`

Export an existing document to a different format.

**Request Body:**
```json
{
  "documentId": "doc_1234567890_abc123",
  "outputFormat": "docx"
}
```

### 4. Edit Document

**POST** `/api/v1/documents/edit`

Edit or refine an existing document.

**Request Body:**
```json
{
  "documentId": "doc_1234567890_abc123",
  "editInstructions": "Make the tone more formal and add a conclusion section",
  "outputFormat": "pdf"
}
```

## Document Types

- `letter` - Business or personal letters
- `essay` - Academic essays
- `article` - Articles and blog posts
- `blog_post` - Blog posts
- `report` - Business reports
- `proposal` - Business proposals
- `memo` - Internal memos
- `email` - Professional emails
- `contract` - Legal contracts
- `resume` - Resumes and CVs
- `cover_letter` - Cover letters
- `research_paper` - Academic research papers
- `white_paper` - Technical white papers
- `business_plan` - Business plans
- `technical_doc` - Technical documentation
- `general` - General documents (default)

## Output Formats

- `pdf` - PDF format (default)
- `docx` - Microsoft Word (OpenXML)
- `doc` - Microsoft Word (Legacy)
- `txt` - Plain text
- `html` - HTML format
- `md` - Markdown format

## Tone Options

- `professional` - Business and professional tone (default)
- `casual` - Relaxed and conversational
- `formal` - Very formal and structured
- `friendly` - Warm and approachable
- `academic` - Scholarly and research-oriented
- `creative` - Artistic and imaginative
- `persuasive` - Convincing and compelling
- `technical` - Technical and precise

## Length Options

- `short` - Approximately 250-500 words
- `medium` - Approximately 500-1500 words (default)
- `long` - Approximately 1500-3000 words
- `custom` - Specify exact word count (use `wordCount` parameter)

## Templates

- `business_letter` - Business letter format
- `formal_report` - Formal report structure
- `academic_paper` - Academic paper format
- `creative_writing` - Creative writing style
- `technical_documentation` - Technical docs format
- `standard` - Standard format (default)

## Example Usage

### Example 1: Simple Conversational Request

```javascript
// First request
const response1 = await fetch('/api/v1/documents/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "I need a cover letter for a software engineer position"
  })
});

// If AI needs more info, it will ask
// Continue conversation with same conversationId
const response2 = await fetch('/api/v1/documents/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Make it professional, about 500 words, export as PDF",
    conversationId: "doc_1234567890_abc123"
  })
});
```

### Example 2: Direct Generation

```javascript
const response = await fetch('/api/v1/documents/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "Write a blog post about artificial intelligence trends in 2025",
    documentType: "blog_post",
    outputFormat: "html",
    tone: "casual",
    length: "medium",
    includeTitle: true,
    includeDate: true
  })
});
```

### Example 3: Draft and Refine Flow

```javascript
// Turn 1: Start with minimal info
POST /api/v1/documents/assistant
{
  "message": "Write a proposal about implementing a CRM system"
}

// Response: Draft generated with refinement questions
{
  "isDraft": true,
  "document": { 
    "content": "...",
    "url": "https://..." 
  },
  "improvementQuestions": [
    "What specific CRM features are most important?",
    "What's your budget range?",
    "What's the implementation timeline?"
  ],
  "message": "I've created a draft proposal for you in PDF format.\n\nWould you like me to refine it? I can improve the document if you answer these questions:\n\n1. What specific CRM features are most important?\n2. What's your budget range?\n3. What's the implementation timeline?\n\nFeel free to answer any or all of these questions, or just tell me what you'd like to change!",
  "conversationId": "doc_xxx"
}

// Turn 2: Provide refinement details
POST /api/v1/documents/assistant
{
  "message": "Focus on sales automation and email integration. Budget is $50k-$100k. Timeline is 3 months.",
  "conversationId": "doc_xxx"
}

// Response: Refined document generated
{
  "isDraft": false,
  "document": { ... },
  "message": "I've updated your proposal with the details you provided!"
}
```

## Configuration

### Environment Variables

```env
# Google Cloud Storage (Optional)
GCS_BUCKET_NAME=ason-documents
GCP_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json

# Gemini AI (Required)
GEMINI_SECRET_KEY=your-gemini-api-key
```

### Output Directory

Documents are saved to `output/documents/` by default.

## Draft-First Workflow

This module follows a **draft-first approach** that's different from traditional document generators:

### How It Works

1. **Quick Draft Generation**: Provide minimal information (just a topic or idea)
2. **Immediate Results**: Get a complete draft document right away
3. **Smart Refinement**: System suggests targeted questions to improve the document
4. **Iterative Improvement**: Answer questions or provide feedback to refine the draft
5. **Final Output**: Get the polished document in your preferred format

### Example Flow

```
You: "Write a cover letter for a software engineer position"
     ↓
System: Creates draft immediately + asks:
  - What specific technologies should I highlight?
  - What's the company name and role?
  - Any specific achievements to mention?
     ↓
You: "Focus on React and Node.js. Company is TechCorp. Mention my 5 years of experience."
     ↓
System: Generates refined version with those details
```

### Why This Approach?

- **Faster**: Get results immediately, refine as needed
- **Less Intimidating**: Don't need to think of all requirements upfront
- **More Natural**: Similar to how humans draft documents
- **Flexible**: Can iterate multiple times until satisfied

## Features in Detail

### Conversational Intelligence

The module uses AI to:
- Generate drafts with minimal information
- Understand user intent from natural language
- Extract document parameters automatically
- Suggest targeted improvement questions after drafting
- Maintain context across multiple turns
- Summarize long conversations to stay within token limits

### Context Management

- Tracks conversation history
- Stores collected parameters in metadata
- Summarizes long conversations automatically
- Retrieves previous context efficiently

### Guest User Support

- Generates temporary user IDs for guests
- Full feature access without authentication
- Conversation persistence during session

### Subscription Limits

For authenticated users:
- Checks usage limits against subscription
- Enforces monthly quotas
- Provides upgrade prompts when limits reached

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "data": {
    "error": "Detailed error information"
  }
}
```

## Rate Limiting

Default rate limits (can be configured):
- Conversational Assistant: 30 requests per 15 minutes
- Direct Generation: 20 requests per 15 minutes
- Export: 20 requests per 15 minutes
- Edit: 20 requests per 15 minutes

## File Structure

```
document_drafting/
├── document.constant.js       # Configuration and constants
├── document.controller.js     # Route controllers
├── document.route.js          # Route definitions
├── document.service.js        # Business logic
├── document.validation.js     # Request validation schemas
├── services/
│   ├── conversationAnalyzer.js   # AI intent analysis
│   └── gcsUploadService.js       # Cloud storage
└── utils/
    └── documentExporter.js       # Format exporters
```

## Dependencies

- `@google/generative-ai` - Gemini AI integration
- `@google-cloud/storage` - GCS uploads (optional)
- `pdfkit` - PDF generation
- `zod` - Request validation
- `mongoose` - Database operations

## Future Enhancements

- [ ] Proper DOCX generation using 'docx' npm package
- [ ] Document templates library
- [ ] Collaborative editing
- [ ] Version history
- [ ] Document database storage
- [ ] Advanced formatting options
- [ ] Custom branding/headers/footers
- [ ] Multi-language support
- [ ] OCR for image-based content

## Notes

- Current DOCX export is simplified (text-based)
- For production, implement proper DOCX generation using 'docx' package
- GCS integration is optional; falls back to local storage
- Documents are stored in `output/documents/` directory
