# Code Assistant API - Guest User Support

## Overview
The Code Assistant API now supports both authenticated and guest users, making it accessible to everyone while maintaining premium features for authenticated users.

## API Endpoints

### POST `/code/assistant`
**Access:** Open to all (authenticated and guest users)

#### For Authenticated Users:
- Include `Authorization: Bearer <token>` header
- Full conversation history is saved
- Usage counts against subscription limits
- Full rate limiting (30 requests per 15 minutes)

#### For Guest Users:
- No authorization header required
- Conversation history is not persisted
- No subscription limits
- Same rate limiting applies (30 requests per 15 minutes)
- Guest ID is auto-generated for session tracking

#### Request Body:
```json
{
  "message": "string (required, max 5000 chars)",
  "conversationId": "string (optional)"
}
```

#### Response Format:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Code task completed successfully",
  "data": {
    "responseMessage": "AI response here",
    "conversationId": "generated-conversation-id",
    "messageCount": 2,
    "userType": "guest|authenticated",
    "userId": "guest-user-id (only for guests)"
  }
}
```

### GET `/code/stats`
**Access:** Authenticated users only

Returns usage statistics for the authenticated user.

## Implementation Details

### Guest User Features:
- ✅ Full AI assistant functionality
- ✅ Auto-generated guest user ID
- ✅ Session-based conversation tracking
- ❌ No persistent conversation history
- ❌ No usage statistics
- ❌ No subscription benefits

### Authenticated User Features:
- ✅ Full AI assistant functionality
- ✅ Persistent conversation history
- ✅ Usage statistics
- ✅ Subscription-based usage limits
- ✅ Cross-session conversation continuity

## Rate Limiting
Both guest and authenticated users are subject to the same rate limiting:
- 30 requests per 15 minutes per IP/user

## Security Considerations
- Guest users are identified by auto-generated IDs
- No sensitive data is stored for guest users
- Rate limiting prevents abuse
- Guest sessions are not persistent across server restarts

## Usage Examples

### Guest User Request:
```bash
curl -X POST http://localhost:5000/code/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a function to calculate fibonacci numbers"
  }'
```

### Authenticated User Request:
```bash
curl -X POST http://localhost:5000/code/assistant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "message": "Write a function to calculate fibonacci numbers",
    "conversationId": "existing-conversation-id"
  }'
```
