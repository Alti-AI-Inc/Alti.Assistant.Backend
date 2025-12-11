# Conversation Summary System

## Overview

Automatic conversation summarization system that kicks in when conversations exceed 4000 tokens. Summaries are stored in MongoDB and used for context in future messages.

---

## How It Works

### 1. Token Threshold
- **Threshold**: 4000 tokens (~16,000 characters)
- **Estimation**: 1 token ≈ 4 characters
- **Trigger**: Automatically checks after each message save

### 2. Summary Generation
When threshold is exceeded:
1. Gemini 2.0 Flash analyzes entire conversation
2. Generates structured summary:
   - **Summary**: 2-3 sentence overview
   - **Context**: Key info to continue conversation
   - **Topics**: Main subjects discussed
   - **Entities**: Names, services mentioned
   - **Apps**: Which apps/tools were used

### 3. Storage
Summaries stored in `conversation_summaries` collection with:
- Conversation ID linkage
- Message range (start/end indices)
- Token count
- Metadata (topics, entities, apps)
- Status (active/superseded/archived)

### 4. Usage
- **New messages**: Use summary + last 5 messages for context
- **App detection**: Summary includes detected apps
- **LLM prompts**: Summary prepended to system prompt
- **Token savings**: 4000+ tokens → compact summary

---

## Database Schema

```javascript
{
  conversationId: String,        // Links to conversation
  userId: String,                // Owner
  summary: String,               // Brief overview
  context: String,               // Continuation context
  messageRange: {
    startIndex: Number,          // First message index
    endIndex: Number,            // Last message index
    totalMessages: Number        // Count of summarized messages
  },
  tokenCount: Number,            // Total tokens in summarized content
  metadata: {
    keyTopics: [String],         // ["email", "GitHub", "branches"]
    entities: [String],          // ["terraform-lib", "john@example.com"]
    detectedApps: [String],      // ["Gmail", "GitHub", "Slack"]
    summaryVersion: String       // "1.0"
  },
  status: String,                // "active" | "superseded" | "archived"
  createdAt: Date,
  updatedAt: Date
}
```

---

## Example Flow

### Conversation Start
```
Message 1-10: Normal messages (< 4000 tokens)
- No summary needed
- Uses all 10 messages for context
```

### Threshold Exceeded
```
Message 11: Conversation now has 4200 tokens
- System detects threshold exceeded
- Generates summary of messages 1-11
- Saves to conversation_summaries collection
```

### After Summary
```
Message 12: User sends new message
- System loads:
  ✓ Summary (messages 1-11 compressed)
  ✓ Recent 5 messages (7-11)
- Total context: Summary + 5 messages (much less than 4000 tokens)
```

### Multiple Summaries
```
Message 50: Conversation grows to 8000 tokens
- Old summary marked as "superseded"
- New summary generated for messages 1-50
- Status: Only latest summary is "active"
```

---

## API Integration

### Automatic (Current Implementation)
- Summarization triggered automatically after `saveMessage()`
- Non-blocking async operation
- No code changes needed in controllers

### Manual Trigger (Available)
```javascript
import { conversationSummaryService } from './conversationSummary.service.js';

// Force summarization check
await conversationSummaryService.checkAndSummarizeIfNeeded(conversationId, userId);

// Get context with summary
const context = await conversationSummaryService.getConversationContext(conversationId, userId);
// Returns: { hasSummary, summary, context, keyTopics, entities, detectedApps, recentMessages }
```

---

## Example Summary Output

### Input (4500 tokens of conversation)
```
User: "I want to send an email"
Assistant: "Please provide recipient, subject, content"
User: "to john@example.com"
Assistant: "Great! What's the subject and message?"
User: "Subject 'Meeting' body 'Tomorrow at 3pm'"
Assistant: "Email sent!"
User: "Now list my GitHub branches"
... (continues for many messages)
```

### Generated Summary
```
SUMMARY: User completed email send to john@example.com about a meeting, 
then switched to GitHub repository management requesting branch listings.

CONTEXT: User is currently working with GitHub repositories after 
successfully sending an email. Last action was listing branches.

TOPICS: email, meeting, GitHub, branches, repository

ENTITIES: john@example.com, terraform-lib repository

APPS: Gmail, GitHub
```

---

## Benefits

1. **Token Efficiency**: 
   - 4000+ tokens → ~200 token summary
   - Saves ~95% of context tokens
   
2. **Better Context**:
   - Structured information (topics, entities, apps)
   - Clear continuation context
   
3. **Cost Reduction**:
   - Fewer tokens sent to LLM APIs
   - Lower API costs for long conversations
   
4. **Performance**:
   - Faster LLM responses (less context to process)
   - Async summarization (doesn't block user)

---

## Configuration

Current settings in `conversationSummary.service.js`:
```javascript
TOKEN_THRESHOLD = 4000          // When to summarize
RECENT_MESSAGE_LIMIT = 5        // How many recent messages to include
SUMMARY_MODEL = "gemini-2.5-flash"
```

---

## Monitoring

Check logs for:
```
"Conversation X has Y tokens"           // Token count check
"📝 Generating summary..."              // Summarization started
"✅ Summary created and saved"          // Summary completed
"📋 Using conversation summary"         // Summary being used
```

---

## Future Enhancements

1. **Incremental Summaries**: Summarize in chunks rather than entire conversation
2. **Custom Thresholds**: Per-user or per-app token limits
3. **Summary Quality Metrics**: Track how useful summaries are
4. **Manual Controls**: User-triggered summarization
5. **Export Summaries**: Download conversation summaries
