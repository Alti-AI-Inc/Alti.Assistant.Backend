# Article Writer Module

## Overview
The Article Writer module provides an AI-powered article writing service that allows users to generate high-quality articles based on text input or uploaded files. Users can specify the article type, tone, and length to get customized content.

## Features
- 🤖 AI-powered article generation using Google Gemini
- 📄 Support for file uploads (PDF, DOCX, TXT, etc.)
- 💬 Conversational interface with conversation history
- 🎨 Multiple article types and writing tones
- 📏 Configurable article lengths
- 🔐 Support for both authenticated and guest users
- 💾 Conversation persistence

## Endpoints

### 1. Generate Article (Conversational)
**POST** `/article-writer/assistant`

Generate an article based on user input with optional file upload.

#### Request
**Headers:**
- `Authorization: Bearer <token>` (optional for authenticated users)

**Body (multipart/form-data):**
```json
{
  "message": "Write an article about artificial intelligence in healthcare",
  "conversationId": "article_1234567890_abc123" (optional),
  "userId": "guest_user_id" (optional, for guests),
  "articleType": "blog_post" (optional),
  "tone": "professional" (optional),
  "length": "medium" (optional)
}
```

**Optional File Upload:**
- Field name: `file`
- Supported formats: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT
- Max size: 10MB

#### Article Types
- `blog_post` - Engaging blog post
- `news_article` - Factual news article
- `technical_article` - Technical documentation
- `opinion_piece` - Opinion/editorial piece
- `how_to_guide` - Step-by-step guide
- `listicle` - List-based article
- `case_study` - Case study analysis
- `research_article` - Research paper
- `general` - General article (default)

#### Writing Tones
- `professional` (default)
- `casual`
- `formal`
- `conversational`
- `persuasive`
- `informative`
- `entertaining`
- `academic`

#### Article Lengths
- `short` - 300-500 words
- `medium` - 500-1000 words (default)
- `long` - 1000-2000 words
- `comprehensive` - 2000+ words

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Article generated successfully",
  "data": {
    "conversationId": "article_1234567890_abc123",
    "article": "# Article Title\n\nArticle content here...",
    "metadata": {
      "articleType": "blog_post",
      "tone": "professional",
      "length": "medium"
    }
  }
}
```

### 2. Get Conversation History
**GET** `/article-writer/conversation/:conversationId`

Retrieve the full conversation history for a specific conversation.

#### Request
**Headers:**
- `Authorization: Bearer <token>` (required)

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversationId": "article_1234567890_abc123",
    "userId": "user123",
    "title": "Article: Write an article about AI...",
    "messages": [
      {
        "role": "user",
        "content": "Write an article about AI",
        "timestamp": "2025-12-25T10:00:00.000Z",
        "metadata": {
          "hasFile": false
        }
      },
      {
        "role": "assistant",
        "content": "# Artificial Intelligence...",
        "timestamp": "2025-12-25T10:00:05.000Z",
        "metadata": {
          "articleType": "blog_post",
          "tone": "professional",
          "length": "medium"
        }
      }
    ],
    "metadata": {
      "category": "article_writer",
      "model": "gemini-2.5-flash",
      "userType": "authenticated"
    }
  }
}
```

## Usage Examples

### Example 1: Simple Article Generation
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a blog post about the benefits of meditation"
  }'
```

### Example 2: Article with Specifications
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write about cloud computing",
    "articleType": "technical_article",
    "tone": "professional",
    "length": "long"
  }'
```

### Example 3: Article from Uploaded File
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "message=Expand this into a comprehensive article" \
  -F "file=@document.pdf" \
  -F "articleType=blog_post" \
  -F "length=medium"
```

### Example 4: Continue Conversation
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Make it more casual and add examples",
    "conversationId": "article_1234567890_abc123"
  }'
```

## Configuration

The module uses the following configuration (in `article_writer.constant.js`):

- **Model**: gemini-2.5-flash
- **Temperature**: 0.8 (higher for creative writing)
- **Max Output Tokens**: 16384
- **Max File Size**: 10MB
- **Supported File Types**: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "success": false,
  "message": "Message is required"
}
```

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "success": false,
  "message": "You have reached your article writing limit for this month. Please upgrade your plan to continue."
}
```

#### 404 Not Found
```json
{
  "statusCode": 404,
  "success": false,
  "message": "Conversation not found"
}
```

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "success": false,
  "message": "Failed to generate article"
}
```

## File Structure
```
article_writer/
├── article_writer.constant.js     # Configuration and constants
├── article_writer.controller.js   # HTTP request handlers
├── article_writer.route.js        # Route definitions
├── article_writer.service.js      # Business logic
├── article_writer.validation.js   # Request validation schemas
├── middlewares/
│   └── uploadArticleFile.js      # File upload middleware
└── README.md                      # This file
```

## Integration with Conversations Module

The Article Writer module integrates with the conversations module to:
- Create and manage conversation sessions
- Store message history
- Track uploaded files
- Maintain user context across multiple requests

## Subscription Limits

For authenticated users, the module checks subscription limits before processing requests. Guests users can use the service with a generated guest ID but may have different limitations.

## Best Practices

1. **File Uploads**: Use files as source material for article expansion or transformation
2. **Conversation Continuity**: Use `conversationId` to maintain context across multiple requests
3. **Specific Instructions**: Be clear and specific in your message about what you want
4. **Parameter Usage**: Use article type, tone, and length parameters for better results
5. **Error Handling**: Always check the response status and handle errors appropriately

## Dependencies

- Google Generative AI SDK
- Multer (file upload)
- Mongoose (database)
- Express (routing)
- Zod (validation)

## Notes

- The article is returned as plain text with proper formatting (headings, paragraphs)
- File uploads are temporary and deleted after processing
- Conversations are stored for future reference
- The AI model is optimized for creative and engaging writing
