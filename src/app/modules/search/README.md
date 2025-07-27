# Search Assistant API - Guest User Support

## Overview
The Search Assistant API now supports both authenticated and guest users, making it accessible to everyone while maintaining premium features for authenticated users.

## API Endpoints

### POST `/search/assistant`
**Access:** Open to all (authenticated and guest users)

#### For Authenticated Users:
- Include `Authorization: Bearer <token>` header
- Full conversation history is saved
- Usage counts against subscription limits
- Full rate limiting (30 requests per 15 minutes)
- Supports both streaming and non-streaming responses

#### For Guest Users:
- No authorization header required
- Conversation history is not persisted
- No subscription limits
- Same rate limiting applies (30 requests per 15 minutes)
- Guest ID is auto-generated for session tracking
- Supports both streaming and non-streaming responses

#### Request Body:
```json
{
  "message": "string (required, max 1000 chars)",
  "conversationId": "string (optional)",
  "deepSearch": "boolean (optional)"
}
```

#### Response Format (Non-streaming):
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Search completed successfully",
  "data": {
    "responseMessage": "AI response here",
    "conversationId": "generated-conversation-id",
    "messageCount": 2,
    "userType": "guest|authenticated",
    "userId": "guest-user-id (only for guests)"
  }
}
```

#### Response Format (Streaming):
Server-Sent Events (SSE) with:
```javascript
// Chunk data
data: {"chunk": "partial response", "conversationId": "conv-id", "userType": "guest"}

// Final data
data: {"complete": true, "fullResponse": "complete response", "conversationId": "conv-id", "success": true, "userType": "guest", "userId": "guest-id"}
```

### GET `/search/stats`
**Access:** Authenticated users only

Returns usage statistics for the authenticated user.

## Implementation Details

### Guest User Features:
- ✅ Full AI search functionality
- ✅ Auto-generated guest user ID
- ✅ Session-based conversation tracking
- ✅ Deep search capability
- ✅ Streaming responses
- ❌ No persistent conversation history
- ❌ No usage statistics
- ❌ No subscription benefits

### Authenticated User Features:
- ✅ Full AI search functionality
- ✅ Persistent conversation history
- ✅ Usage statistics
- ✅ Subscription-based usage limits
- ✅ Cross-session conversation continuity
- ✅ Deep search capability
- ✅ Streaming responses

## Rate Limiting
Both guest and authenticated users are subject to the same rate limiting:
- 30 requests per 15 minutes per IP/user

## Security Considerations
- Guest users are identified by auto-generated IDs
- No sensitive data is stored for guest users
- Rate limiting prevents abuse
- Guest sessions are not persistent across server restarts

## Usage Examples

### Guest User Request (Non-streaming):
```bash
curl -X POST http://localhost:5000/search/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Latest developments in AI technology",
    "deepSearch": true
  }'
```

### Guest User Request (Streaming):
```bash
curl -X POST http://localhost:5000/search/assistant \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "Latest developments in AI technology"
  }'
```

### Authenticated User Request:
```bash
curl -X POST http://localhost:5000/search/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "message": "Latest developments in AI technology",
    "conversationId": "existing-conversation-id",
    "deepSearch": true
  }'
```
