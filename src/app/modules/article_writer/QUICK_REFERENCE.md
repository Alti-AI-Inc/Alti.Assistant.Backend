# Article Writer API - Quick Reference Card

## Endpoint
```
POST /article-writer/assistant
```

## Basic Request
```json
{
  "message": "Write about [your topic]"
}
```

## Full Request Options
```json
{
  "message": "Your writing instructions",
  "conversationId": "article_xxx_xxx",
  "userId": "guest_user_id",
  "articleType": "blog_post",
  "tone": "professional",
  "length": "medium"
}
```

## Article Types
| Type | Description |
|------|-------------|
| `blog_post` | Engaging, conversational |
| `news_article` | Factual, objective |
| `technical_article` | Technical, detailed |
| `opinion_piece` | Persuasive viewpoint |
| `how_to_guide` | Step-by-step |
| `listicle` | List-based |
| `case_study` | Analysis |
| `research_article` | Academic |
| `general` | Default, flexible |

## Tones
`professional` | `casual` | `formal` | `conversational` | `persuasive` | `informative` | `entertaining` | `academic`

## Lengths
| Length | Word Count |
|--------|-----------|
| `short` | 300-500 |
| `medium` | 500-1000 |
| `long` | 1000-2000 |
| `comprehensive` | 2000+ |

## File Upload
- **Field name**: `file`
- **Max size**: 10MB
- **Formats**: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT
- **Content-Type**: multipart/form-data

## Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Article generated successfully",
  "data": {
    "conversationId": "article_1234_abc",
    "article": "# Article text...",
    "metadata": {
      "articleType": "blog_post",
      "tone": "professional",
      "length": "medium"
    }
  }
}
```

## Quick Examples

### Simple (Guest)
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Write about AI"}'
```

### With Parameters
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "message": "Explain blockchain",
    "articleType": "technical_article",
    "tone": "professional",
    "length": "long"
  }'
```

### With File
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Authorization: Bearer TOKEN" \
  -F "message=Expand this" \
  -F "file=@document.pdf" \
  -F "articleType=blog_post"
```

### Continue
```bash
curl -X POST http://localhost:5000/article-writer/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Make it shorter",
    "conversationId": "article_1234_abc"
  }'
```

## Status Codes
- `200` - Success
- `400` - Bad request (missing message)
- `403` - Limit reached
- `404` - Conversation not found
- `500` - Server error

## Tips
✓ Be specific in your message  
✓ Upload files for context  
✓ Use appropriate article type  
✓ Match tone to audience  
✓ Iterate with conversationId  

## Test
```bash
node scripts/test-article-writer.js
```

## Postman
Import: `postman_collections/Article_Writer_API.postman_collection.json`

---
**Full docs**: `src/app/modules/article_writer/README.md`
