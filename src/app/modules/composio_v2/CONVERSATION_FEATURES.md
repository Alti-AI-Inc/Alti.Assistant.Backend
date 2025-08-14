# Composio V2 Conversational Features

## Overview

The Composio V2 module now includes comprehensive conversational logic that allows users to interact with various connected applications through natural language conversations. The module maintains conversation history, context awareness, and provides a chat-like interface for automation tasks.

## New Features Added

### 1. Conversational Chat Interface
- **Endpoint**: `POST /api/v1/composio-v2/chat`
- Natural language interaction with connected apps
- Context-aware responses based on conversation history
- Support for both authenticated and guest users
- Subscription-based usage tracking

### 2. Conversation Management
- **Get Conversation**: `GET /api/v1/composio-v2/conversation/:conversationId`
- **List User Conversations**: `GET /api/v1/composio-v2/conversations`
- Automatic conversation creation and retrieval
- Message history storage and retrieval
- Conversation metadata tracking

### 3. Enhanced AI Classification
- Improved conversation context handling
- Better user input processing with history
- More accurate app and action identification

## API Endpoints

### Chat Endpoint
```
POST /api/v1/composio-v2/chat
```

**Request Body:**
```json
{
  "message": "Send an email to john@example.com with subject 'Meeting Tomorrow'",
  "conversationId": "composio-1642636800000-abc123def", // optional
  "userId": "user123" // optional for guest users
}
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Composio automation processed successfully",
  "data": {
    "conversationId": "composio-1642636800000-abc123def",
    "response": "I've successfully sent the email to john@example.com with the subject 'Meeting Tomorrow'.",
    "metadata": {
      "identifiedApp": "gmail",
      "identifiedAction": "send_email",
      "confidence": 0.95,
      "executionResult": { /* execution details */ }
    },
    "isGuest": false,
    "executionResult": { /* detailed execution result */ }
  }
}
```

### Get Conversation
```
GET /api/v1/composio-v2/conversation/:conversationId
```

**Query Parameters (for guest users):**
- `userId`: Guest user identifier

### List User Conversations
```
GET /api/v1/composio-v2/conversations
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sortBy`: Sort field (default: 'lastActivity')
- `sortOrder`: Sort order (-1 for desc, 1 for asc)
- `search`: Search term
- `userId`: Required for guest users

## Key Features

### 1. Context Awareness
- Maintains conversation history for up to 10 previous messages
- Uses conversation context to provide more relevant responses
- Supports follow-up questions and references to previous actions

### 2. Guest User Support
- Generates unique guest user IDs for unauthenticated users
- Tracks guest conversations separately
- No subscription limits for guest users

### 3. Subscription Management
- Integrated with existing subscription system
- Usage tracking and limits enforcement
- Upgrade prompts when limits are reached

### 4. Error Handling
- Comprehensive error handling and logging
- Graceful degradation when services are unavailable
- User-friendly error messages

### 5. Message Types
- User messages with type `composio_query`
- Assistant responses with type `composio_response`
- Metadata tracking for execution results

## Usage Examples

### Starting a New Conversation
```javascript
// Client-side example
const response = await fetch('/api/v1/composio-v2/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    message: "Create a new GitHub repository called 'my-project'"
  })
});
```

### Continuing an Existing Conversation
```javascript
const response = await fetch('/api/v1/composio-v2/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    message: "Now add a README file to it",
    conversationId: "composio-1642636800000-abc123def"
  })
});
```

### Retrieving Conversation History
```javascript
const conversation = await fetch('/api/v1/composio-v2/conversation/composio-1642636800000-abc123def', {
  headers: {
    'Authorization': 'Bearer your-token'
  }
});
```

## Database Schema

### Conversation Model Extensions
The conversations now support Composio-specific metadata:

```javascript
metadata: {
  category: 'composio', // Identifies Composio conversations
  userType: 'guest' | 'authenticated',
  isGuest: boolean,
  // ... other metadata
}
```

### Message Metadata
Each message includes additional metadata:

```javascript
metadata: {
  isGuest: boolean,
  type: 'composio_query' | 'composio_response',
  identifiedApp: string, // For responses
  identifiedAction: string, // For responses
  confidence: number, // For responses
  executionResult: object // For responses
}
```

## Integration with Existing Systems

### AI Classification Service
- Leverages the existing `aiClassificationService.processUserInputService`
- Passes conversation history for better context understanding
- Returns structured results with app/action identification

### Conversation Helpers
- Uses existing `conversationHelpers` for database operations
- Maintains consistency with other conversational modules
- Supports the same conversation management features

### Subscription System
- Integrates with existing `SubscriptionModel`
- Enforces usage limits for authenticated users
- Provides upgrade prompts when limits are exceeded

## Error Scenarios and Handling

1. **Invalid Conversation ID**: Returns 404 with appropriate message
2. **Subscription Limit Exceeded**: Returns 403 with upgrade prompt
3. **Missing Required Fields**: Returns 400 with validation errors
4. **Service Unavailable**: Returns 500 with fallback message
5. **Authentication Errors**: Handled by existing auth middleware

## Future Enhancements

1. **Streaming Responses**: Real-time response streaming for better UX
2. **Rich Media Support**: Support for images, files, and other media
3. **Advanced Context**: Longer conversation memory and cross-session context
4. **Analytics**: Conversation analytics and usage insights
5. **Templates**: Pre-built conversation templates for common tasks

## Testing

To test the conversational features:

1. Ensure you have connected accounts for supported apps
2. Use the `/chat` endpoint with natural language requests
3. Test conversation continuity by providing `conversationId`
4. Verify guest user functionality without authentication
5. Test subscription limits with authenticated users

## Security Considerations

- All conversations are user-scoped and isolated
- Guest user data is temporary and not persistent long-term
- Subscription limits prevent abuse
- All API calls are logged for audit purposes
- Sensitive data in messages is handled according to privacy policies
