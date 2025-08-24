# Workflow Storage Module

The Workflow Storage Module provides functionality to analyze user input using Composio v2's `planWorkflow` functionality and store the resulting workflows without executing them. Users can then execute these stored workflows later by clicking a button.

## Features

### 🎯 Core Functionality
- **Workflow Analysis**: Uses Composio v2's `planWorkflow` to analyze user input
- **Workflow Storage**: Stores both single-step and multi-step workflows
- **Execution Planning**: Creates detailed execution plans without executing
- **Connection Management**: Tracks required app connections and missing connections
- **Status Management**: Manages workflow states (draft, ready, archived)

### 🔍 Workflow Management
- **Search & Filter**: Search workflows by content, filter by type, status, category
- **Tagging System**: Organize workflows with custom tags
- **Categories**: Categorize workflows (automation, data_processing, communication, etc.)
- **Statistics**: Get insights into workflow usage and patterns

### ⚙️ Integration
- **Composio v2 Integration**: Seamlessly integrates with existing Composio v2 module
- **Execution Ready**: Convert stored workflows to execution-ready format
- **Connection Refresh**: Update workflow status based on current app connections

## API Endpoints

### Workflow Analysis & Storage

#### `POST /api/workflow-storage/analyze`
Analyze user input and store workflow without execution.

**Request Body:**
```json
{
  "userInput": "Send me a daily email with GitHub issues summary", // required
  "title": "Daily GitHub Issues Report", // optional
  "description": "Automated daily report of GitHub issues", // optional
  "conversationId": "conv_123", // optional
  "conversationContext": {}, // optional
  "tags": ["daily", "github", "email"], // optional
  "category": "automation" // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow analyzed and stored successfully",
  "data": {
    "workflowId": "workflow_1692547200_abc123",
    "title": "Daily GitHub Issues Report",
    "workflowType": "multi_step",
    "status": "ready",
    "requiredApps": ["github", "gmail"],
    "totalSteps": 2,
    "missingConnections": [],
    "isExecutable": true,
    "planningMetadata": {
      "reasoning": "This requires GitHub to fetch issues and Gmail to send email",
      "confidence": 0.95,
      "planningTime": "2025-08-20T10:30:00Z"
    },
    "createdAt": "2025-08-20T10:30:00Z"
  }
}
```

### Workflow Retrieval

#### `GET /api/workflow-storage/workflows`
Get user's stored workflows with filtering and pagination.

**Query Parameters:**
- `status`: 'draft' | 'ready' | 'archived'
- `workflowType`: 'single_step' | 'multi_step'
- `category`: Category filter
- `tags`: Comma-separated tags or array
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset (default: 0)
- `sortBy`: Sort field (default: 'createdAt')
- `sortOrder`: Sort order, 1 or -1 (default: -1)

#### `GET /api/workflow-storage/workflows/executable`
Get workflows that are ready for execution (all connections available).

#### `GET /api/workflow-storage/workflows/search?searchTerm=email`
Search workflows by content, title, description, or tags.

#### `GET /api/workflow-storage/workflows/:workflowId`
Get specific workflow details.

### Workflow Management

#### `PUT /api/workflow-storage/workflows/:workflowId`
Update workflow metadata.

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "tags": ["updated", "tags"],
  "category": "productivity",
  "status": "ready"
}
```

#### `DELETE /api/workflow-storage/workflows/:workflowId`
Delete stored workflow.

#### `POST /api/workflow-storage/workflows/:workflowId/refresh-connections`
Refresh workflow connections and update executable status.

#### `POST /api/workflow-storage/workflows/:workflowId/prepare-execution`
Convert stored workflow to execution-ready format for Composio v2.

**Response:**
```json
{
  "success": true,
  "message": "Workflow prepared for execution",
  "data": {
    "userId": "user123",
    "title": "Daily GitHub Issues Report",
    "description": "Automated daily report",
    "executionPlan": [...],
    "workflowType": "multi_step",
    "requiredApps": ["github", "gmail"],
    "triggerType": "manual",
    "originalUserInput": "Send me a daily email with GitHub issues summary",
    "conversationId": "conv_123",
    "conversationContext": {}
  }
}
```

### Analytics

#### `GET /api/workflow-storage/workflows/statistics`
Get workflow statistics for the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalWorkflows": 25,
    "readyWorkflows": 20,
    "draftWorkflows": 5,
    "singleStepWorkflows": 15,
    "multiStepWorkflows": 10,
    "totalExecutions": 150,
    "averageSteps": 2.4
  }
}
```

## Data Models

### StoredWorkflow Schema

```javascript
{
  workflowId: String, // unique identifier
  userId: String, // owner user ID
  title: String, // workflow title
  description: String, // workflow description
  workflowType: 'single_step' | 'multi_step',
  status: 'draft' | 'ready' | 'archived',
  requiredApps: [String], // required app slugs
  executionPlan: [ExecutionStep], // detailed execution steps
  totalSteps: Number,
  crossStepParameters: Object, // parameter mapping between steps
  originalUserInput: String, // original user request
  planningMetadata: {
    reasoning: String,
    confidence: Number,
    planningTime: Date,
    executionType: String
  },
  conversationId: String,
  conversationContext: Object,
  connectedAccounts: [Object], // user's connected accounts
  missingConnections: [String], // apps missing connections
  tags: [String], // user-defined tags
  category: String, // workflow category
  isTemplate: Boolean, // whether this is a template
  executionCount: Number, // number of times executed
  lastExecuted: Date, // last execution timestamp
  createdAt: Date,
  updatedAt: Date
}
```

### ExecutionStep Schema

```javascript
{
  step: Number, // step number
  app: String, // app slug
  action: String, // action name
  description: String, // step description
  parameters: Object, // action parameters
  dependencies: [Number], // dependent steps
  outputMapping: Object // output parameter mapping
}
```

## Virtual Fields

- `isExecutable`: Boolean - whether workflow can be executed (all connections available)
- `complexity`: String - 'simple', 'medium', or 'complex' based on step count

## Integration with Composio v2

The module seamlessly integrates with the existing Composio v2 module:

1. **Planning**: Uses `planWorkflowNode` from Composio v2 for workflow analysis
2. **Execution**: Stored workflows can be converted to Composio v2 execution format
3. **Connections**: Leverages Composio v2's connection management
4. **Multi-step Support**: Full support for complex multi-step workflows

## Usage Example

```javascript
import { workflowStorageService } from './src/app/modules/workflow_storage';

// Analyze and store workflow
const result = await workflowStorageService.analyzeAndStoreWorkflow({
  userInput: "Create a GitHub issue when I receive an urgent email",
  userId: "user123",
  title: "Email to GitHub Issue",
  category: "automation",
  tags: ["email", "github", "urgent"]
});

// Get user's workflows
const workflows = await workflowStorageService.getUserStoredWorkflows("user123", {
  status: "ready",
  limit: 10
});

// Prepare for execution
const executionData = await workflowStorageService.prepareWorkflowForExecution(
  "workflow_123",
  "user123"
);
```

## Status Management

### Workflow Status
- **draft**: Workflow has missing connections or is not ready for execution
- **ready**: All connections available, workflow can be executed
- **archived**: Workflow is archived and hidden from main views

### Connection Management
The module automatically tracks:
- Required app connections for each workflow
- Missing connections that prevent execution
- Automatic status updates when connections change

## Categories

Default workflow categories:
- `automation`: Automated workflows and tasks
- `data_processing`: Data manipulation and processing
- `communication`: Email, messaging, notifications
- `productivity`: Task management, scheduling
- `integration`: App integrations and data sync
- `other`: General purpose workflows

## Error Handling

The module provides comprehensive error handling:
- Input validation
- Connection verification
- Planning errors
- Database errors
- User authentication

All errors include detailed messages and appropriate HTTP status codes.

## Future Enhancements

- **Workflow Templates**: Pre-built workflow templates
- **Workflow Sharing**: Share workflows between users
- **Visual Workflow Builder**: UI for creating workflows
- **Conditional Logic**: Add conditional execution paths
- **Parallel Execution**: Execute independent steps in parallel
- **Workflow Analytics**: Detailed performance metrics
- **Backup/Restore**: Workflow backup and restoration
