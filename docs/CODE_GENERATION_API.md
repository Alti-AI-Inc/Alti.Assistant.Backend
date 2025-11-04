# Code Generation API Documentation

## Overview

The Code Generation API is a dedicated endpoint that uses **Claude Sonnet 4.5** to generate high-quality, production-ready code based on user requests. Unlike the general search assistant, this endpoint is optimized specifically for code generation tasks.

## Endpoint

```
POST /api/v1/search/code
```

## Features

- ✅ **Always uses Claude Sonnet 4.5** - Best-in-class code generation model
- ✅ **Internet Search Capability** - Can search for documentation, best practices, and examples when needed
- ✅ **Context-Aware** - Maintains conversation history for iterative code development
- ✅ **Production-Ready Code** - Generates complete, working implementations with proper error handling
- ✅ **Multiple Languages** - Supports JavaScript, TypeScript, Python, Java, and more
- ✅ **Best Practices** - Follows language-specific conventions and security guidelines
- ✅ **Guest & Authenticated Users** - Available for both user types

## Request Format

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <token>" // Optional for authenticated users
}
```

### Request Body
```json
{
  "message": "Write a Node.js script for JWT authentication",
  "conversationId": "optional-conversation-id",
  "userId": "optional-user-id" // For guest users
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | Yes | The code generation request |
| `conversationId` | string | No | ID to continue existing conversation |
| `userId` | string | No | User ID (auto-generated for guests) |

## Response Format

### Success Response (200 OK)

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Code generated successfully",
  "data": {
    "responseMessage": {
      "answer": "// Complete code implementation here...",
      "reference": [],
      "citations": [],
      "citationMetadata": {
        "model": "claude-sonnet-4-5",
        "type": "code_generation",
        "timestamp": "2025-11-04T13:30:00.000Z",
        "tokensUsed": 2500
      }
    },
    "conversationId": "code-1730729400000-abc123",
    "messageCount": 2,
    "userType": "guest",
    "model": "claude-sonnet-4-5"
  }
}
```

### Error Response (400 Bad Request)

```json
{
  "statusCode": 400,
  "success": false,
  "message": "A code generation request is required"
}
```

### Error Response (403 Forbidden)

```json
{
  "statusCode": 403,
  "success": false,
  "message": "You have reached your code generation limit for this month. Please upgrade your plan to continue."
}
```

## Usage Examples

### Example 1: Simple Code Generation

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/search/code \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a Python function to validate email addresses"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "responseMessage": {
      "answer": "Here's a Python function to validate email addresses:\n\n```python\nimport re\n\ndef validate_email(email: str) -> bool:\n    \"\"\"\n    Validate email address format using regex.\n    ...\n    \"\"\"\n    # Implementation...\n```"
    }
  }
}
```

### Example 2: Node.js Authentication Script

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/search/code \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write me a Node.js script for JWT authentication with Express.js"
  }'
```

### Example 3: Continuing a Conversation

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/search/code \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Now add refresh token functionality",
    "conversationId": "code-1730729400000-abc123"
  }'
```

## Key Differences from `/assistant` Endpoint

| Feature | `/code` Endpoint | `/assistant` Endpoint |
|---------|------------------|----------------------|
| **Model** | Always Claude Sonnet 4.5 | Smart routing (Claude/Gemini) |
| **Purpose** | Code generation only | General search & research |
| **Output** | Complete code implementations | Search results, explanations |
| **Search** | Can search for documentation | Web & YouTube search |
| **Token Limit** | 8000 tokens | 4000 tokens |
| **Temperature** | 0.3 (consistent code) | 0.7 (creative responses) |

## Supported Languages

The endpoint supports code generation for:

- **JavaScript** (Node.js, React, Vue, Angular)
- **TypeScript**
- **Python** (Flask, Django, FastAPI)
- **Java** (Spring Boot)
- **Go**
- **Rust**
- **PHP** (Laravel)
- **Ruby** (Rails)
- **C#** (.NET)
- **Swift**
- **Kotlin**
- And more...

## Code Quality Standards

All generated code follows:

1. ✅ **Best Practices** - Language-specific conventions
2. ✅ **Error Handling** - Proper try-catch and validation
3. ✅ **Security** - No hardcoded secrets, input validation
4. ✅ **Documentation** - Inline comments and JSDoc/docstrings
5. ✅ **Modern Syntax** - Latest language features
6. ✅ **Production-Ready** - Complete implementations, no TODOs

## Rate Limiting

- **Guest Users**: 20 requests per 15 minutes
- **Authenticated Users**: Based on subscription plan
- **Subscription Limits**: Checked against monthly usage quota

## Testing

Run the test script to verify the endpoint:

```bash
node test_code_generation.js
```

## Integration Example (Frontend)

```javascript
async function generateCode(request) {
  try {
    const response = await fetch('http://localhost:5000/api/v1/search/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: request,
        conversationId: localStorage.getItem('codeConversationId')
      })
    });

    const data = await response.json();
    
    if (data.success) {
      // Save conversation ID for follow-up requests
      localStorage.setItem('codeConversationId', data.data.conversationId);
      
      // Display generated code
      console.log(data.data.responseMessage.answer);
    }
  } catch (error) {
    console.error('Code generation failed:', error);
  }
}

// Usage
generateCode("Write a React component for a login form");
```

## Notes

1. **Internet Search**: The endpoint can automatically search the internet for documentation and best practices when needed
2. **Context Preservation**: Conversation history is maintained for iterative development
3. **Subscription Usage**: Each code generation request counts toward your monthly quota
4. **Model Consistency**: Always uses Claude Sonnet 4.5 for consistent, high-quality code output

## Support

For issues or questions, please contact the development team or open an issue in the repository.
