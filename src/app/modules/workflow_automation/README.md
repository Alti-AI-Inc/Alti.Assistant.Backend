# Workflow Automation Module

A comprehensive Node.js module for creating and executing automated workflows using natural language prompts, powered by Composio and LangGraph.

## 🌟 Key Features

### 🤖 AI-Powered Workflow Creation
- **Natural Language Processing**: Create workflows using simple conversational prompts
- **Intent Recognition**: Automatically understand user intentions and requirements
- **Smart App Detection**: Identify required apps and services from user descriptions
- **Composio Integration**: Leverage connected apps and authenticated services
- **Real-time Validation**: Ensure apps are connected and tools are available

### 🔗 Composio Integration
- **Connected Apps Only**: Uses apps that users have actually connected and authenticated
- **Tool Validation**: Verifies available tools from user's connected apps
- **AuthConfig Support**: Leverages existing Composio authentication configurations
- **Dynamic App Discovery**: Automatically detects available apps and their capabilities
- **Parameter Extraction**: Extract and validate workflow parameters automatically

### 💬 Conversational Interface
- **Chat-based Creation**: Interactive workflow creation through conversations
- **Confirmation Flow**: Review and approve workflows before creation
- **Context Preservation**: Maintain conversation context across sessions
- **History Management**: Store and retrieve conversation history

### ⚡ Workflow Execution
- **Manual Execution**: Run workflows on demand
- **Scheduled Execution**: Support for daily, weekly, monthly, and custom schedules
- **Real-time Monitoring**: Track execution progress and results
- **Error Handling**: Comprehensive error handling and retry mechanisms

### 🔧 Management Features
- **CRUD Operations**: Full workflow management capabilities
- **Status Control**: Activate, deactivate, or pause workflows
- **Execution History**: Detailed execution logs and analytics
- **Template System**: Pre-built workflow templates for common use cases

## 🔌 Integration Architecture

### Composio Integration Service
The module includes a dedicated `composioIntegration.service.js` that interfaces with existing Composio infrastructure:

- **App Connection Validation**: Checks if users have connected specific apps through AuthConfig
- **Tool Discovery**: Retrieves available tools from connected apps using the Tools schema
- **Authentication Status**: Validates app authentication status before workflow execution
- **Dynamic App Lists**: Returns only apps that users have actively connected and configured

### LangGraph Processing
The workflow processing uses LangGraph nodes that:

- **Analyze Intent**: Parse natural language prompts to understand user goals
- **Plan Workflow**: Break down tasks into executable steps using connected apps
- **Validate Availability**: Ensure all required apps and tools are accessible
- **Generate Response**: Create human-readable confirmations and explanations

### Data Models Integration
- **Workflow Model**: Links to user's connected apps and available tools
- **Execution Model**: Tracks execution against actual app connections
- **Chat History**: Maintains conversation context for iterative workflow creation

## API Endpoints

### Chat Interface
- `POST /workflow-automation/chat/create` - Create workflow from prompt
- `POST /workflow-automation/chat/confirm` - Confirm workflow creation
- `POST /workflow-automation/chat/continue` - Continue conversation
- `GET /workflow-automation/chat/conversations` - Get user conversations
- `GET /workflow-automation/chat/conversations/:id` - Get specific conversation

### Workflow Management
- `GET /workflow-automation/workflows` - Get user workflows
- `GET /workflow-automation/workflows/:id` - Get specific workflow
- `PUT /workflow-automation/workflows/:id` - Update workflow
- `DELETE /workflow-automation/workflows/:id` - Delete workflow
- `PATCH /workflow-automation/workflows/:id/status` - Update workflow status

### Execution Control
- `POST /workflow-automation/execution/:workflowId/execute` - Execute workflow
- `GET /workflow-automation/execution/:workflowId/executions` - Get execution history
- `GET /workflow-automation/execution/executions/:executionId` - Get execution details
- `POST /workflow-automation/execution/executions/:executionId/cancel` - Cancel execution
- `POST /workflow-automation/execution/:workflowId/schedule` - Schedule workflow
- `POST /workflow-automation/execution/:workflowId/unschedule` - Unschedule workflow

### Templates
- `GET /workflow-automation/workflows/templates/list` - Get workflow templates
- `POST /workflow-automation/workflows/templates/:templateId/create` - Create from template

## Usage Examples

### Creating a Workflow from Natural Language

```javascript
// POST /workflow-automation/chat/create
{
  "prompt": "Send me daily Apple stock updates to my email at 9 AM",
  "conversationId": "optional-existing-conversation-id"
}

// Response
{
  "success": true,
  "needsConfirmation": true,
  "message": "I've analyzed your request and created a workflow plan...",
  "data": {
    "conversationId": "conv_abc123",
    "workflowPlan": {
      "userIntent": "Daily Apple stock price email updates",
      "taskType": "email",
      "complexity": "simple",
      "detectedApps": ["finance_api", "email"],
      "scheduleRequired": true,
      "scheduleConfig": {
        "frequency": "daily",
        "time": "09:00",
        "timezone": "UTC"
      }
    }
  }
}
```

### Confirming Workflow Creation

```javascript
// POST /workflow-automation/chat/confirm
{
  "conversationId": "conv_abc123",
  "approved": true,
  "modifications": {
    // Optional modifications to the workflow plan
  }
}

// Response
{
  "success": true,
  "message": "Workflow 'Daily Apple stock updates' created successfully!",
  "data": {
    "workflowId": "workflow_xyz789",
    "workflow": { /* workflow object */ }
  }
}
```

### Executing a Workflow

```javascript
// POST /workflow-automation/execution/workflow_xyz789/execute
{
  "context": {
    "additionalParams": "any additional context"
  }
}

// Response
{
  "success": true,
  "message": "Workflow executed successfully",
  "data": {
    "executionId": "exec_123",
    "result": {
      "success": true,
      "completedSteps": 3,
      "totalSteps": 3,
      "duration": 2340
    }
  }
}
```

## Workflow Structure

### Workflow Model
- **Basic Info**: Name, description, original prompt
- **Steps**: Ordered list of actions to perform
- **Trigger**: Schedule configuration or manual trigger
- **Apps**: Required applications and connection status
- **Metadata**: Additional workflow information

### Execution Model
- **Execution Record**: Complete execution log with timing
- **Step Results**: Individual step outcomes and data
- **Error Handling**: Detailed error information and stack traces
- **Context**: Execution context and variable passing

### Chat History Model
- **Conversation**: Message history and context
- **Workflow Links**: Associated workflows created
- **Metadata**: Intent analysis and extracted entities

## Integration with Composio

The module integrates with Composio for:
- **App Connections**: Manage OAuth and API connections
- **Tool Execution**: Execute actions across different platforms
- **Authentication**: Handle user authentication for external services

## LangGraph Workflow

The AI processing pipeline includes:
1. **Intent Analysis**: Understand user request
2. **Workflow Planning**: Create execution plan
3. **Schedule Detection**: Identify timing requirements
4. **Parameter Extraction**: Extract required parameters
5. **Validation**: Validate workflow and dependencies
6. **Response Generation**: Generate appropriate user response

## Environment Variables

Required environment variables:
- `OPENAI_API_KEY`: OpenAI API key for LLM processing
- `COMPOSIO_API_KEY`: Composio API key for app integrations
- `MONGODB_URI`: MongoDB connection string

## Dependencies

- **@langchain/core**: Core LangChain functionality
- **@langchain/langgraph**: Workflow graph processing
- **@langchain/openai**: OpenAI LLM integration
- **@composio/core**: Composio integration
- **mongoose**: MongoDB object modeling
- **node-cron**: Cron job scheduling
- **uuid**: Unique ID generation

## Error Handling

The module implements comprehensive error handling:
- **Validation Errors**: Parameter and workflow validation
- **Execution Errors**: Runtime error handling and recovery
- **Network Errors**: API call failures and retries
- **Authentication Errors**: OAuth and API key issues

## Monitoring and Logging

- **Execution Logs**: Detailed step-by-step execution logs
- **Performance Metrics**: Execution timing and success rates
- **Error Tracking**: Comprehensive error logging and stack traces
- **User Analytics**: Workflow usage and conversation patterns

## Security

- **User Isolation**: All workflows are user-scoped
- **Authentication**: JWT-based authentication required
- **Authorization**: Role-based access control
- **Data Protection**: Sensitive data encryption and secure storage