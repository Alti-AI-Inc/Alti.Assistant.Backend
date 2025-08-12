# Conversational AI Classification Workflow

This enhanced workflow provides persistent conversation memory using MongoDB checkpointer, enabling natural conversational flows across multiple interactions.

## Key Features

### 🧠 **Conversation Memory**
- **Persistent Storage**: All conversations are stored in MongoDB using LangGraph's checkpointer
- **Context Awareness**: The system remembers previous apps, actions, and parameters
- **Turn Management**: Tracks conversation turns and maintains chronological order
- **Smart References**: Understands phrases like "do the same thing", "again", "like before"

### 🔄 **Two-Node Classification**
1. **App Classification Node**: Identifies which app to use from your database
2. **Action Classification Node**: Identifies which action to perform within the app

### 💾 **State Management**
- **Conversation Context**: Tracks last app, action, parameters, and user preferences
- **Message History**: Maintains full conversation history with timestamps
- **Real-time Updates**: Updates context after each successful action

## Workflow Structure

```
START → classifyApp → classifyAction → filterTools → extractParameters → executeTool → generateResponse → END
```

## API Usage

### Starting a New Conversation

```javascript
import { runAIClassificationAgent } from './workflow.js';

const result = await runAIClassificationAgent("I want to send an email", {
  userId: "user123",
  conversationId: "optional_conversation_id", // Auto-generated if not provided
  retrieveHistory: false // Set to false for new conversations
});
```

### Continuing a Conversation

```javascript
const result = await runAIClassificationAgent("Send the same email again", {
  userId: "user123", 
  conversationId: "existing_conversation_id",
  retrieveHistory: true // Retrieves conversation history for context
});
```

### Managing Conversation History

```javascript
import { 
  getConversationHistory, 
  clearConversationHistory 
} from './workflow.js';

// Get conversation history
const history = await getConversationHistory("conversation_id");

// Clear conversation history  
const cleared = await clearConversationHistory("conversation_id");
```

## Conversation Context Structure

```javascript
{
  lastApp: "gmail",                    // Last app used
  lastAction: "send_email",            // Last action performed  
  lastParameters: {                    // Last parameters used
    to: "john@example.com",
    subject: "Hello"
  },
  recentTools: [                       // Recently used tools
    "gmail_send_email",
    "github_create_issue"
  ],
  userPreferences: {},                 // User preferences (future use)
  conversationSummary: "",             // Summary of conversation
  turnCount: 5                         // Number of turns in conversation
}
```

## Smart Context Understanding

The system understands conversational references:

### Repetition Commands
- **"Do the same thing"** → Uses last app and action
- **"Send the same email again"** → Uses Gmail send_email with previous parameters
- **"Create another issue"** → Uses GitHub create_issue

### App Context
- **"Now do that in GitHub"** → Switches to GitHub with similar action
- **"Send an email instead"** → Switches to Gmail

### Parameter Memory
- **"Send it to Mary instead"** → Uses same action but changes recipient
- **"Make it urgent"** → Modifies previous parameters

## REST API Endpoints

### POST `/api/conversation/message`
Send a message in a conversation.

```javascript
{
  "message": "I want to send an email",
  "userId": "user123",
  "conversationId": "conv_123", // Optional
  "retrieveHistory": true
}
```

### GET `/api/conversation/:conversationId/history`
Retrieve conversation history.

### DELETE `/api/conversation/:conversationId/history`  
Clear conversation history.

### POST `/api/conversation/new`
Start a new conversation.

```javascript
{
  "userId": "user123",
  "initialMessage": "Hello, I want to create a GitHub issue"
}
```

## Database Integration

The workflow integrates with your existing Tool model:
- **Apps**: Retrieved using `Tool.find({}).distinct('slug')`
- **Actions**: Retrieved using `Tool.find({ slug: appName })`
- **Schema**: `{ slug: "app_name", name: "action_name", description: "why use this action" }`

## Configuration

### MongoDB Checkpointer
```javascript
const checkpointer = await MongoDBSaver.fromUri(
  config.database_local,
  "ai_classification_checkpoints"
);
```

### State Channels
- Conversation history with merge function
- Message arrays with timestamps
- Context object with default values

## Example Conversation Flow

```
User: "I want to send an email to john@example.com"
→ App: gmail, Action: send_email

User: "Now do the same thing but for mary@example.com"  
→ App: gmail (from context), Action: send_email (from context)

User: "Create a GitHub issue instead"
→ App: github, Action: create_issue

User: "Send that email again"
→ App: gmail (remembered), Action: send_email (remembered)
```

## Benefits

1. **Natural Conversations**: Users can refer to previous actions naturally
2. **Reduced Repetition**: No need to specify app/action for repeated tasks
3. **Context Continuity**: Maintains understanding across conversation turns
4. **Smart Defaults**: Suggests actions based on conversation history
5. **Persistent Memory**: Conversations survive server restarts

## Error Handling

- Invalid conversation IDs return appropriate error messages
- Missing context gracefully falls back to fresh classification
- MongoDB connection issues are handled with retry logic
- State corruption is detected and conversations can be reset

## Performance Considerations

- Conversation history is limited to last 3 messages for context (configurable)
- State updates are atomic using MongoDB transactions
- Checkpointer cleanup can be scheduled for old conversations
- Memory usage is optimized by storing only essential context

This conversational workflow transforms your AI agent from a stateless request-response system into an intelligent, context-aware assistant that can maintain natural conversations across multiple interactions.
