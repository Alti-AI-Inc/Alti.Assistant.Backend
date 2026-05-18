# Rewrite Module

A comprehensive content rewriting module that supports both conversational and direct rewriting of documents and text. Users can upload files or provide text directly and receive rewritten content in their preferred style and format.

## Features

- 🤖 **Conversational AI Assistant** - Natural language interface for rewriting requests
- 📄 **Multiple Input Formats** - Support for text input or file uploads (PDF, DOCX, TXT, etc.)
- 🎨 **Multiple Rewrite Styles** - Formal, casual, professional, academic, creative, and more
- 🔄 **Flexible Rewrite Modes** - Preserve meaning, simplify, expand, shorten, or paraphrase
- 📁 **Optional File Generation** - Create downloadable files when requested
- 💬 **Conversation History** - Maintains context across multiple requests
- 👤 **Guest & Authenticated Users** - Supports both user types

## API Endpoints

### 1. Conversational Assistant (Recommended)

**POST** `/api/v1/rewrite/assistant`

Natural language interface for rewriting. Users can chat naturally and the system will understand their intent.

#### Request Body

```json
{
  "message": "Rewrite this in a formal tone",
  "conversationId": "optional-conversation-id",
  "textContent": "Your text here (optional if uploading file)"
}
```

#### Form Data (Multipart)

- `message` (required): Natural language request
- `conversationId` (optional): To continue a conversation
- `textContent` (optional): Direct text to rewrite
- `file` (optional): Document to rewrite (PDF, DOCX, TXT, etc.)

#### Examples

**Example 1: Rewrite text in formal tone**

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Make this more formal",
    "textContent": "Hey! Thanks for the update. I will check it out soon."
  }'
```

**Example 2: Upload file and request rewrite**

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -F "message=Rewrite this document in a professional style" \
  -F "file=@document.pdf"
```

**Example 3: Request file output**

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -F "message=Simplify this and create a file" \
  -F "textContent=Complex technical documentation..."
```

#### Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Content rewritten successfully",
  "data": {
    "success": true,
    "conversationId": "rewrite_1234567890_abc123",
    "rewrittenContent": "The rewritten text...",
    "originalContent": "Original text...",
    "metadata": {
      "intent": "formal",
      "style": "professional",
      "mode": "preserve_meaning",
      "contentLength": {
        "original": 100,
        "rewritten": 120
      }
    },
    "file": {
      "filename": "rewritten_1234567890_document.txt",
      "path": "gs://alti_files/rewrites/user123/rewritten_1234567890_document.txt",
      "publicUrl": "https://storage.googleapis.com/alti_files/rewrites/...",
      "size": 1024,
      "storageType": "gcs"
    },
    "outputFormat": "both"
  }
}
```

### 2. Direct Rewrite (Programmatic)

**POST** `/api/v1/rewrite/rewrite`

Direct rewriting with explicit parameters. Best for programmatic access.

#### Request Body

```json
{
  "textContent": "Text to rewrite",
  "intent": "formal",
  "style": "professional",
  "mode": "preserve_meaning",
  "targetAudience": "business executives",
  "additionalInstructions": "Keep it concise",
  "outputFormat": "text"
}
```

#### Form Data (Multipart)

- `textContent` (optional if file provided): Text to rewrite
- `file` (optional): Document to rewrite
- `intent` (optional): Rewrite intent (see options below)
- `style` (optional): Writing style (see options below)
- `mode` (optional): Rewrite mode (see options below)
- `targetAudience` (optional): Intended audience
- `additionalInstructions` (optional): Custom instructions
- `outputFormat` (optional): `text`, `file`, or `both`

#### Intent Options

- `general_rewrite` - General improvement
- `formal` - Formal tone
- `casual` - Casual/friendly tone
- `professional` - Professional tone
- `academic` - Academic style
- `creative` - Creative writing
- `simplify` - Make simpler
- `expand` - Add more details
- `shorten` - Make shorter
- `improve_clarity` - Improve clarity
- `change_tone` - Adjust tone
- `fix_grammar` - Fix grammar
- `paraphrase` - Complete rewrite

#### Style Options

- `formal` - Formal writing
- `casual` - Casual/conversational
- `professional` - Professional/business
- `academic` - Academic/scholarly
- `creative` - Creative/artistic
- `technical` - Technical documentation
- `conversational` - Natural conversation
- `persuasive` - Persuasive writing

#### Mode Options

- `preserve_meaning` - Keep original meaning (default)
- `improve_clarity` - Focus on clarity
- `simplify` - Make it simpler
- `expand` - Add more details
- `shorten` - Make it shorter
- `paraphrase` - Complete rewrite

#### Example

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/rewrite \
  -H "Content-Type: application/json" \
  -d '{
    "textContent": "Hey! I wanted to let you know about the meeting tomorrow.",
    "intent": "professional",
    "style": "formal",
    "mode": "preserve_meaning",
    "outputFormat": "text"
  }'
```

### 3. Get Conversation History

**GET** `/api/v1/rewrite/conversation/:conversationId`

Retrieve the history of a rewrite conversation.

#### Example

```bash
curl -X GET http://localhost:3000/api/v1/rewrite/conversation/rewrite_1234567890_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversationId": "rewrite_1234567890_abc123",
    "title": "Rewrite: Make this more formal...",
    "messages": [
      {
        "role": "user",
        "content": "Make this more formal",
        "timestamp": "2025-12-16T10:30:00.000Z",
        "metadata": {
          "hasFile": false,
          "hasText": true
        }
      },
      {
        "role": "assistant",
        "content": "The rewritten text...",
        "timestamp": "2025-12-16T10:30:05.000Z",
        "metadata": {
          "rewriteMetadata": {...}
        }
      }
    ],
    "metadata": {
      "category": "rewrite",
      "model": "gemini-2.5-flash",
      "collectedParams": {...}
    },
    "createdAt": "2025-12-16T10:30:00.000Z",
    "updatedAt": "2025-12-16T10:30:05.000Z"
  }
}
```

## Usage Examples

### Example 1: Quick Text Rewrite

```javascript
// Conversational approach
const response = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Make this professional',
    textContent: 'Thanks for the help! Really appreciate it.',
  }),
});
```

### Example 2: File Upload with Specific Requirements

```javascript
const formData = new FormData();
formData.append('message', 'Rewrite this in academic style and create a file');
formData.append('file', documentFile);

const response = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  body: formData,
});
```

### Example 3: Programmatic Rewrite

```javascript
const response = await fetch('/api/v1/rewrite/rewrite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    textContent: 'Your content here',
    intent: 'formal',
    style: 'academic',
    mode: 'expand',
    outputFormat: 'both',
  }),
});
```

### Example 4: Continuing a Conversation

```javascript
// First request
const firstResponse = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Rewrite this formally',
    textContent: 'Hey! Great work on the project.',
  }),
});

const { conversationId } = await firstResponse.json();

// Follow-up request
const secondResponse = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Now make it more casual',
    conversationId: conversationId,
  }),
});
```

## Supported File Formats

- PDF (`.pdf`)
- Microsoft Word (`.docx`, `.doc`)
- Plain Text (`.txt`)
- Microsoft Excel (`.xlsx`, `.xls`)
- Microsoft PowerPoint (`.pptx`, `.ppt`)

Maximum file size: 10 MB

## Authentication

- **Optional Authentication**: Endpoints support both authenticated and guest users
- **Authenticated Users**: Include JWT token in Authorization header
- **Guest Users**: System automatically generates a temporary user ID

## Rate Limiting

- **Assistant Endpoint**: 30 requests per 15 minutes
- **Direct Rewrite**: 20 requests per 15 minutes

## Error Handling

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "success": false,
  "message": "Error description",
  "data": {
    "error": "Detailed error information"
  }
}
```

Common error codes:

- `400` - Bad request (missing parameters, invalid file)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (usage limit reached)
- `404` - Not found (conversation not found)
- `500` - Internal server error

## Best Practices

1. **Use Conversational Assistant** for user-facing features - it's more intuitive
2. **Use Direct Rewrite** for backend/programmatic integrations
3. **Maintain conversation context** by passing `conversationId` for follow-ups
4. **Request files only when needed** to optimize response time
5. **Provide clear instructions** in the message for best results
6. **Check file size** before upload (max 10MB)

## Configuration

Configuration is defined in [rewrite.constant.js](rewrite.constant.js):

- AI Model: `gemini-2.5-flash`
- Temperature: `0.7`
- Max Output Tokens: `8192`
- Upload Folder: `uploads/rewrites`
- Output Folder: `output/rewrites`

### Google Cloud Storage Configuration

The module uploads generated files to Google Cloud Storage (GCS) for reliable storage and accessibility:

- **Bucket Name**: `alti_files` (configurable via `GCS_BUCKET_NAME` environment variable)
- **Folder Prefix**: `rewrites/`
- **Storage Structure**: `rewrites/{userId}/{filename}`
- **Access**: Files are accessible via signed URLs (valid for 7 days)
- **Fallback**: If GCS is not configured, files are stored locally

Environment variables needed for GCS:

```bash
GCS_BUCKET_NAME=alti_files
GCP_PROJECT_ID=your-project-id
GCS_KEY_FILE=path/to/service-account-key.json
```

If GCS credentials are not configured, the system will automatically fall back to local file storage.

## Module Structure

```
rewrite/
├── rewrite.constant.js      # Configuration and constants
├── rewrite.service.js        # Core business logic
├── rewrite.controller.js     # Request handlers
├── rewrite.route.js          # Route definitions
├── rewrite.validation.js     # Request validation schemas
├── middlewares/
│   └── uploadRewrite.js      # File upload middleware
├── services/
│   └── gcsUploadService.js   # Google Cloud Storage upload
└── README.md                 # This file
```

## Integration

To integrate this module into your application routes:

```javascript
import { rewriteRoutes } from './modules/rewrite/rewrite.route.js';

// Add to your main router
app.use('/api/v1/rewrite', rewriteRoutes);
```

## Dependencies

@google-cloud/storage` - Google Cloud Storage for file uploads

- `
- `@google/generative-ai` - AI text generation
- `multer` - File upload handling
- `zod` - Request validation
- Document review module's `fileProcessor` - Text extraction from files

## Future Enhancements

- [ ] Support for more file formats (Markdown, HTML)
- [ ] Batch rewriting (multiple files/texts)
- [ ] Custom style templates
- [ ] Diff view between original and rewritten
- [ ] Translation + rewriting combination
- [ ] Voice input support
