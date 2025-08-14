# Composio V2 Conversational Integration Guide

## Quick Start

The Composio V2 module now supports conversational interactions similar to the search module. Here's how to integrate and use the new features:

## Frontend Integration

### React/JavaScript Example

```javascript
import { useState } from 'react';

const ComposioChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch('/api/v1/composio-v2/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: inputValue,
          conversationId: conversationId
        })
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage = {
          role: 'assistant',
          content: data.data.response,
          metadata: data.data.metadata
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setConversationId(data.data.conversationId);
      } else {
        console.error('Error:', data.message);
      }
    } catch (error) {
      console.error('Network error:', error);
    } finally {
      setLoading(false);
      setInputValue('');
    }
  };

  return (
    <div className="composio-chat">
      <div className="messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="content">{message.content}</div>
            {message.metadata && (
              <div className="metadata">
                App: {message.metadata.identifiedApp} | 
                Action: {message.metadata.identifiedAction}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="loading">Processing...</div>}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask me to automate something..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !inputValue.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ComposioChat;
```

### Loading Conversation History

```javascript
const loadConversation = async (conversationId) => {
  try {
    const response = await fetch(`/api/v1/composio-v2/conversation/${conversationId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await response.json();

    if (data.success) {
      const messages = data.data.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata
      }));
      
      setMessages(messages);
      setConversationId(conversationId);
    }
  } catch (error) {
    console.error('Error loading conversation:', error);
  }
};
```

### Listing User Conversations

```javascript
const ConversationList = () => {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/v1/composio-v2/conversations?page=1&limit=20', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setConversations(data.data.conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  return (
    <div className="conversation-list">
      {conversations.map(conv => (
        <div key={conv.conversationId} className="conversation-item">
          <h3>{conv.title}</h3>
          <p>Last activity: {new Date(conv.lastActivity).toLocaleString()}</p>
          <p>Messages: {conv.messageCount}</p>
          <button onClick={() => loadConversation(conv.conversationId)}>
            Open
          </button>
        </div>
      ))}
    </div>
  );
};
```

## Backend Integration

### Express.js Route Setup

```javascript
import express from 'express';
import { composioV2Routes } from './src/app/modules/composio_v2/composio.route.js';

const app = express();

// Mount the composio v2 routes
app.use('/api/v1/composio-v2', composioV2Routes);
```

### Middleware Configuration

```javascript
import { authenticate, authenticateOptional } from './middleware/auth.js';

// For endpoints that require authentication
router.post('/chat', authenticate, composioController.composioConversationController);
router.get('/conversations', authenticate, composioController.getUserComposioConversationsController);

// For endpoints that support guest users
router.post('/chat', authenticateOptional, composioController.composioConversationController);
```

## Environment Variables

Make sure these environment variables are set:

```env
# Composio Configuration
COMPOSIO_ORG_API_KEY=your_composio_api_key

# Database Configuration
MONGODB_URI=your_mongodb_connection_string

# JWT Configuration (if using authentication)
JWT_SECRET=your_jwt_secret
```

## Database Collections

The conversational features use the existing `conversations` collection with these fields for Composio:

```javascript
{
  conversationId: "composio-1642636800000-abc123def",
  userId: ObjectId("..."),
  title: "Send email to john@example.com",
  messages: [
    {
      role: "user",
      content: "Send an email to john@example.com",
      timestamp: ISODate("..."),
      metadata: {
        isGuest: false,
        type: "composio_query"
      }
    },
    {
      role: "assistant", 
      content: "I've sent the email successfully",
      timestamp: ISODate("..."),
      metadata: {
        isGuest: false,
        type: "composio_response",
        identifiedApp: "gmail",
        identifiedAction: "send_email",
        confidence: 0.95
      }
    }
  ],
  metadata: {
    category: "composio",
    userType: "authenticated",
    isGuest: false
  },
  status: "active",
  lastActivity: ISODate("..."),
  messageCount: 2
}
```

## Error Handling

### Client-side Error Handling

```javascript
const handleChatResponse = async (response) => {
  const data = await response.json();
  
  if (!data.success) {
    switch (data.statusCode) {
      case 403:
        // Subscription limit reached
        showUpgradePrompt(data.message);
        break;
      case 400:
        // Validation error
        showError(data.message);
        break;
      case 500:
        // Server error
        showError('Something went wrong. Please try again.');
        break;
      default:
        showError(data.message || 'Unknown error occurred');
    }
    return;
  }
  
  // Handle success
  handleSuccessResponse(data);
};
```

### Server-side Error Handling

The module includes comprehensive error handling for:

- Invalid conversation IDs
- Subscription limit violations  
- Missing required fields
- Service unavailability
- Authentication errors

## Testing

### Unit Tests

```javascript
// test/composio-v2.test.js
import { composioService } from '../src/app/modules/composio_v2/composio.service.js';

describe('Composio V2 Conversational Features', () => {
  test('should generate unique conversation ID', () => {
    const id1 = composioService.generateComposioConversationId();
    const id2 = composioService.generateComposioConversationId();
    
    expect(id1).toMatch(/^composio-\d+-[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  test('should handle conversation creation', async () => {
    const conversation = await composioService.handleComposioConversation(
      'test-user',
      null,
      'Test message',
      false
    );
    
    expect(conversation.conversationId).toMatch(/^composio-/);
    expect(conversation.metadata.category).toBe('composio');
  });
});
```

### Integration Tests

Use the provided test file:

```bash
node src/app/modules/composio_v2/test_conversational_features.js
```

## Performance Considerations

1. **Message History Limit**: Only last 10 messages are used for context to prevent token overflow
2. **Database Indexing**: Conversations are indexed by userId and conversationId
3. **Caching**: Consider implementing Redis caching for frequently accessed conversations
4. **Rate Limiting**: Implement rate limiting to prevent abuse

## Security Best Practices

1. **Authentication**: Always verify user identity before accessing conversations
2. **Authorization**: Users can only access their own conversations
3. **Input Validation**: All user inputs are validated and sanitized
4. **Audit Logging**: All API calls are logged for security auditing
5. **Data Privacy**: Guest user data should be cleaned up periodically

## Migration from Existing Classify-and-Execute

If you're currently using the classify-and-execute endpoint, you can easily migrate:

```javascript
// Old way
await fetch('/api/v1/composio-v2/classify-and-execute', {
  method: 'POST',
  body: JSON.stringify({ userInput: 'Send email', userId: 'user123' })
});

// New conversational way
await fetch('/api/v1/composio-v2/chat', {
  method: 'POST', 
  body: JSON.stringify({ message: 'Send email', userId: 'user123' })
});
```

The new chat endpoint provides the same functionality with added conversation management.

## Support and Troubleshooting

### Common Issues

1. **Conversation not found**: Ensure the conversationId exists and belongs to the user
2. **Subscription limits**: Check user subscription status and usage
3. **Authentication errors**: Verify JWT token is valid and not expired
4. **Service errors**: Check Composio API key and connected accounts

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
DEBUG=composio:*
```

This will provide detailed logs for troubleshooting.
