# Article Writer Module - Quick Start Guide

## Overview
The Article Writer module enables AI-powered article generation with support for file uploads and various customization options.

## Quick Setup

1. **Module is already integrated** - The Article Writer module is automatically loaded when you start the server.

2. **API Endpoint**: `POST /article-writer/assistant`

3. **Base URL**: `http://localhost:5000` (or your configured server URL)

## Quick Examples

### Example 1: Generate a Simple Article (Guest User)

```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a blog post about the benefits of daily exercise"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Article generated successfully",
  "data": {
    "conversationId": "article_1735123456_xyz789",
    "article": "# The Benefits of Daily Exercise\n\nRegular exercise is...",
    "metadata": {
      "articleType": "general",
      "tone": "professional",
      "length": "medium"
    }
  }
}
```

### Example 2: Generate with Custom Parameters (Authenticated)

```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Write about blockchain technology",
    "articleType": "technical_article",
    "tone": "professional",
    "length": "long"
  }'
```

### Example 3: Generate from Uploaded File

```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "message=Expand this into a blog post" \
  -F "file=@notes.pdf" \
  -F "articleType=blog_post" \
  -F "tone=casual"
```

### Example 4: Continue a Conversation

```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Make it shorter and more engaging",
    "conversationId": "article_1735123456_xyz789"
  }'
```

## Available Parameters

### Article Types
- `blog_post` - Conversational and engaging
- `news_article` - Factual and objective
- `technical_article` - Technical and detailed
- `opinion_piece` - Persuasive viewpoint
- `how_to_guide` - Step-by-step instructions
- `listicle` - List-based format
- `case_study` - Real-world example analysis
- `research_article` - Academic and evidence-based
- `general` - Default, adaptable style

### Writing Tones
- `professional` (default)
- `casual`
- `formal`
- `conversational`
- `persuasive`
- `informative`
- `entertaining`
- `academic`

### Article Lengths
- `short` - 300-500 words
- `medium` - 500-1000 words (default)
- `long` - 1000-2000 words
- `comprehensive` - 2000+ words

## Testing with Postman

1. Import the collection: `postman_collections/Article_Writer_API.postman_collection.json`
2. Set the `baseUrl` variable to your server URL
3. Set the `authToken` variable (if using authenticated endpoints)
4. Try the pre-configured requests

## Common Use Cases

### 1. Blog Post from Topic
```json
{
  "message": "Write a blog post about sustainable living",
  "articleType": "blog_post",
  "tone": "conversational",
  "length": "medium"
}
```

### 2. Technical Documentation
```json
{
  "message": "Explain how REST APIs work",
  "articleType": "technical_article",
  "tone": "professional",
  "length": "long"
}
```

### 3. How-To Guide
```json
{
  "message": "How to bake sourdough bread",
  "articleType": "how_to_guide",
  "tone": "informative",
  "length": "medium"
}
```

### 4. Expand Notes into Article
Upload a file with notes and ask:
```json
{
  "message": "Turn these notes into a comprehensive article",
  "articleType": "general",
  "length": "long"
}
```

## Tips for Best Results

1. **Be Specific**: Clearly state what you want in the message
2. **Use Context**: Upload files to provide source material
3. **Choose Appropriate Type**: Select the article type that matches your needs
4. **Match Tone to Audience**: Pick a tone suitable for your target readers
5. **Iterate**: Use conversation history to refine the article
6. **Provide Examples**: Mention specific examples you want included

## Troubleshooting

### Error: "Message is required"
- Solution: Ensure the `message` field is included in your request

### Error: "File type not supported"
- Solution: Use supported file types: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT

### Error: "Reached article writing limit"
- Solution: Upgrade your subscription plan or wait for the limit to reset

### Article not as expected
- Solution: Be more specific in your message, try different article types or tones

## File Upload Requirements

- **Max file size**: 10MB
- **Supported formats**: 
  - Documents: PDF, DOCX, DOC, TXT
  - Spreadsheets: XLSX, XLS
  - Presentations: PPTX, PPT
- **Upload field name**: `file`
- **Request type**: `multipart/form-data`

## Response Format

The API returns a plain text article with:
- Proper structure (headings, paragraphs)
- Clear formatting
- Appropriate length based on your request
- Tone matching your specification

Example response structure:
```
# Article Title

Introduction paragraph explaining the topic...

## Section 1

Content for section 1...

## Section 2

Content for section 2...

## Conclusion

Concluding thoughts...
```

## Integration Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

async function generateArticle() {
  const response = await axios.post('http://localhost:5000/article-writer/assistant', {
    message: 'Write about climate change',
    articleType: 'blog_post',
    tone: 'informative',
    length: 'medium'
  });
  
  console.log(response.data.data.article);
}
```

### Python
```python
import requests

def generate_article():
    response = requests.post(
        'http://localhost:5000/article-writer/assistant',
        json={
            'message': 'Write about climate change',
            'articleType': 'blog_post',
            'tone': 'informative',
            'length': 'medium'
        }
    )
    
    print(response.json()['data']['article'])
```

### cURL with File
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -F "message=Expand this document" \
  -F "file=@document.pdf" \
  -F "articleType=blog_post"
```

## Next Steps

1. Try the examples above
2. Explore different article types and tones
3. Test with file uploads
4. Use conversation history for iterative refinement
5. Integrate into your application

## Support

For issues or questions:
- Check the main README.md for detailed documentation
- Review the Postman collection for request examples
- Check the logs for error details

## Module Structure

```
article_writer/
├── article_writer.constant.js     # Configuration
├── article_writer.controller.js   # Request handlers
├── article_writer.route.js        # Routes
├── article_writer.service.js      # Business logic
├── article_writer.validation.js   # Validation
├── middlewares/
│   └── uploadArticleFile.js      # File upload
├── README.md                      # Full documentation
└── QUICKSTART.md                  # This file
```

Happy writing! 🚀
