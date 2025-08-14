# Composio V2 AI Classification Module

This module provides AI-powered user input classification and automatic tool execution for Composio integrations. It follows the same workflow pattern as the search module, using LangGraph state management and nodes.

## Features

- **🔄 Multi-Step Workflow Orchestration**: Automatically plans and executes complex workflows requiring multiple apps
- **AI-Powered Classification**: Automatically identifies the app and action from natural language input
- **🎯 Intelligent App Discovery**: Identifies all required apps for complex user requests
- **📋 Execution Planning**: Creates detailed step-by-step plans with dependency management
- **🔗 Cross-Step Parameter Mapping**: Seamlessly passes data between workflow steps
- **Tool Filtering**: Finds and filters relevant tools for the identified request
- **Parameter Extraction**: Extracts necessary parameters from user input using AI
- **Automatic Execution**: Executes the appropriate Composio tool with extracted parameters
- **Conversational Responses**: Generates natural language responses for users
- **🔄 Backward Compatibility**: Maintains full compatibility with single-step workflows

## Architecture

### Workflow Nodes

1. **classifyUserInputNode**: Uses AI to classify user input and identify app/action
2. **filterRelevantToolsNode**: Finds available tools and filters by relevance
3. **extractParametersNode**: Extracts and validates parameters for tool execution
4. **executeToolNode**: Executes the identified tool via Composio
5. **generateResponseNode**: Generates user-friendly response

### State Management

The module uses LangGraph state management with the following key state fields:

- `userInput`: Original user message
- `identifiedApp`: Classified app (e.g., "gmail", "github")
- `identifiedAction`: Classified action (e.g., "send_email", "create_issue")
- `confidence`: Classification confidence score
- `availableTools`: Tools available for the app
- `relevantTools`: Tools filtered for the action
- `extractedParameters`: Parameters extracted from user input
- `executionResult`: Result from tool execution
- `response`: Final response to user

## Supported Apps and Actions

### Gmail
- send_email, read_email, delete_email, mark_as_read, search_email

### GitHub
- create_issue, create_pr, list_repos, create_repo, star_repo, fork_repo

### Google Calendar
- create_event, list_events, update_event, delete_event, find_available_time

### LinkedIn
- post_update, send_message, connect_user, share_article

### Twitter/X
- post_tweet, delete_tweet, follow_user, send_dm, like_tweet

### YouTube
- search_videos, upload_video, like_video, subscribe_channel

### Notion
- create_page, update_page, create_database, add_to_database

### Amazon
- search_product, add_to_cart, place_order, track_order

### Slack
- send_message, create_channel, invite_user, post_announcement

### Discord
- send_message, create_channel, manage_server

## API Endpoints

### POST `/composio-v2/classify-and-execute`
Main endpoint for processing user input through AI classification and execution.

**Request Body:**
```json
{
  "userInput": "Send an email to john@example.com about the meeting",
  "userId": "user123",
  "conversationId": "conv456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "userInput": "Send an email to john@example.com about the meeting",
    "identifiedApp": "gmail",
    "identifiedAction": "send_email",
    "confidence": 0.95,
    "executionResult": { ... },
    "response": "✅ Email sent successfully to john@example.com",
    "conversationId": "conv456",
    "metadata": { ... }
  }
}
```

### GET `/composio-v2/supported-apps`
Returns list of supported apps and their available actions.

### POST `/composio-v2/test-classification`
Test classification without execution.

**Request Body:**
```json
{
  "userInput": "Create a GitHub issue for the bug"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "app": "github",
    "action": "create_issue",
    "confidence": 0.92,
    "parameters": {
      "title": "Bug report"
    },
    "metadata": {
      "reasoning": "User wants to create an issue on GitHub"
    }
  }
}
```

### GET `/composio-v2/user-connections/:userId`
Get user's connected accounts for all apps.

## Usage Examples

### Basic Usage
```javascript
import { runAIClassificationAgent } from './ai_classification/workflow.js';

// Single-step workflow
const result = await runAIClassificationAgent(
  "Send an email to team@company.com with subject 'Weekly Update'",
  {
    userId: "user123",
    conversationId: "conv456"
  }
);

console.log(result.response); // "✅ Email sent successfully..."
```

### Multi-Step Workflow Usage
```javascript
// Multi-step workflow
const result = await runAIClassificationAgent(
  "Get all my GitHub issues and email them to john@company.com",
  {
    userId: "user123",
    conversationId: "conv456"
  }
);

console.log(result.workflowType);     // "multi_step"
console.log(result.requiredApps);    // ["github", "gmail"]
console.log(result.totalSteps);      // 2
console.log(result.stepResults);     // Array of step execution results
console.log(result.response);        // "✅ Successfully fetched 5 GitHub issues and emailed them to john@company.com"
```

### Complex Multi-Step Example
```javascript
const result = await runAIClassificationAgent(
  "Search my emails for 'project update', create a calendar event to discuss findings, and notify the team on Slack",
  { userId: "user123" }
);

// Automatically creates and executes:
// Step 1: gmail.search_email (search for 'project update')
// Step 2: google_calendar.create_event (create discussion meeting)
// Step 3: slack.send_message (notify team about meeting)
```

### Service Usage
```javascript
import { aiClassificationService } from './aiClassification.service.js';

const result = await aiClassificationService.processUserInputService(
  "Create a calendar event for tomorrow at 2 PM",
  { userId: "user123" }
);
```

## Configuration

The module requires the following configuration:

1. **Groq API Key**: For AI classification and parameter extraction
2. **Composio API Key**: For tool execution
3. **MongoDB**: For conversation persistence and user accounts

## Error Handling

The module includes comprehensive error handling:

- Classification failures fall back to unknown app/action
- Missing connections return helpful error messages
- Parameter extraction errors use fallback values
- Tool execution errors generate user-friendly responses

## File Structure

```
composio_v2/
├── ai_classification/
│   ├── state.js              # LangGraph state definition
│   ├── nodes.js              # Workflow nodes
│   └── workflow.js           # LangGraph workflow
├── services/
│   └── aiClassificationService.js  # AI services (Groq integration)
├── aiClassification.controller.js   # HTTP controllers
├── aiClassification.service.js      # Business logic services
├── composio.model.js               # Database model
└── composio.route.js               # API routes
```

## Dependencies

- `@langchain/langgraph`: State management and workflow orchestration
- `@composio/core`: Composio SDK for tool execution
- `mongoose`: Database ORM for user accounts
- `groq`: AI classification and reasoning

## Development

To extend the module with new apps or actions:

1. Add the app/action to the supported list in `aiClassificationService.js`
2. Update the classification prompts to include the new functionality
3. Test with the `/test-classification` endpoint
4. Add specific parameter extraction logic if needed

## Testing

Use the test endpoint to validate classification:

```bash
curl -X POST http://localhost:3000/api/composio-v2/test-classification \
  -H "Content-Type: application/json" \
  -d '{"userInput": "Post a tweet about our new product launch"}'
```
