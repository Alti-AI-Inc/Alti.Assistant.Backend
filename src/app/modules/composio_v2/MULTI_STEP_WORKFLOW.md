# Multi-Step Workflow Implementation

## Overview

The enhanced Composio v2 agent now supports multi-step workflows that can automatically plan and execute complex user requests requiring multiple apps and actions in sequence. This implementation maintains backward compatibility with single-step workflows while adding powerful orchestration capabilities.

## Architecture

### Workflow Flow

```
START → planWorkflow → [single_step|multi_step] → executeSteps → aggregateResults → generateResponse → END
```

#### Multi-Step Path:
```
planWorkflow → validatePlan → executeStep ⟷ checkCompletion → aggregateResults → generateResponse
                                    ↺ (loop until complete)
```

#### Single-Step Path (Legacy):
```
planWorkflow → classifyApp → classifyAction → filterTools → extractParameters → executeToolNode → generateResponse
```

### Key Components

#### 1. **Planning Phase**
- **App Discovery**: Uses LLM to identify all required apps from user input
- **Action Planning**: Creates detailed execution plan with dependencies
- **Parameter Mapping**: Extracts cross-step parameter flows

#### 2. **Validation Phase**
- **Connection Check**: Validates all required apps have connected accounts
- **Plan Validation**: Ensures execution plan is structurally sound

#### 3. **Execution Phase**
- **Step-by-Step Execution**: Executes each planned step in sequence
- **Dependency Management**: Handles data flow between steps
- **Progress Tracking**: Monitors workflow completion status

#### 4. **Aggregation Phase**
- **Result Compilation**: Combines results from all steps
- **Response Generation**: Creates comprehensive user response

## New State Fields

```javascript
// Multi-step workflow fields
executionPlan: Array,           // Detailed step-by-step plan
currentStep: Number,            // Current execution step index
stepResults: Array,             // Results from completed steps
dependencyGraph: Object,        // Step dependencies and data flow
planningMetadata: Object,       // Planning context and reasoning
requiredApps: Array,            // All apps identified for workflow
crossStepParameters: Object,    // Parameters flowing between steps
workflowComplete: Boolean,      // Workflow completion flag
workflowType: String,          // 'single_step' | 'multi_step'
```

## New Services

### `identifyRequiredApps(userInput, availableApps, context)`
Analyzes user input to identify all apps needed for the complete workflow.

**Example:**
```javascript
Input: "Get my GitHub issues and email them to john@company.com"
Output: {
  requiredApps: ["github", "gmail"],
  workflowType: "multi_step",
  reasoning: "User wants to fetch GitHub issues and then send them via email",
  confidence: 0.95
}
```

### `createExecutionPlan(userInput, requiredApps, actionsMap, context)`
Creates detailed execution plan with step dependencies and parameter mapping.

**Example:**
```javascript
Output: {
  executionPlan: [
    {
      step: 1,
      app: "github",
      action: "list_issues",
      description: "Fetch all GitHub issues",
      parameters: { repository: "auto-detected", state: "open" },
      dependencies: [],
      output_mapping: { "issues_list": "step_2.email_body" }
    },
    {
      step: 2,
      app: "gmail", 
      action: "send_email",
      description: "Send email with GitHub issues",
      parameters: { 
        to: "john@company.com",
        subject: "Your GitHub Issues",
        body: "from_step_1.issues_list"
      },
      dependencies: [1]
    }
  ],
  totalSteps: 2,
  executionType: "sequential"
}
```

### `extractCrossStepParameters(userInput, executionPlan, stepResults)`
Extracts and maps parameters that flow between workflow steps.

## New Workflow Nodes

### Planning Nodes

#### `planWorkflowNode`
- Analyzes user input for workflow complexity
- Identifies required apps using LLM
- Creates execution plan for multi-step workflows
- Routes to appropriate workflow path

#### `validatePlanNode`
- Checks app connection requirements
- Validates execution plan structure
- Ensures workflow is executable

### Execution Nodes

#### `executeStepNode`
- Executes current step in execution plan
- Handles parameter mapping from previous steps
- Stores step results for next steps
- Manages step progression

#### `checkCompletionNode`
- Determines if workflow is complete
- Controls loop back to execution or progression to aggregation

#### `aggregateResultsNode`
- Combines results from all workflow steps
- Generates comprehensive final response
- Prepares aggregated data for user

## Usage Examples

### Basic Multi-Step Workflow
```javascript
import { runAIClassificationAgent } from './ai_classification/workflow.js';

const result = await runAIClassificationAgent(
  "Get my GitHub issues and email them to team@company.com",
  {
    userId: "user123",
    conversationId: "workflow_456"
  }
);

console.log(result.workflowType);        // "multi_step"
console.log(result.requiredApps);       // ["github", "gmail"]
console.log(result.totalSteps);         // 2
console.log(result.stepResults);        // Array of step execution results
console.log(result.aggregatedResults);  // Combined results
```

### Complex Multi-Step Workflow
```javascript
const result = await runAIClassificationAgent(
  "Search emails for 'project update', create calendar event to discuss, and notify team on Slack",
  { userId: "user123" }
);

// Result includes:
// - 3-step execution plan
// - Cross-step parameter mapping
// - Dependency management
// - Comprehensive result aggregation
```

### Single-Step (Legacy Compatibility)
```javascript
const result = await runAIClassificationAgent(
  "Send email to john@company.com",
  { userId: "user123" }
);

console.log(result.workflowType);  // "single_step"
console.log(result.identifiedApp); // "gmail"
// Works exactly like before
```

## Response Structure

### Multi-Step Response
```javascript
{
  success: true,
  workflowType: "multi_step",
  requiredApps: ["github", "gmail"],
  executionPlan: [...],
  totalSteps: 2,
  stepResults: [
    {
      step: 1,
      app: "github",
      action: "list_issues",
      success: true,
      result: {...}
    },
    {
      step: 2, 
      app: "gmail",
      action: "send_email",
      success: true,
      result: {...}
    }
  ],
  aggregatedResults: [...],
  planningMetadata: {
    reasoning: "...",
    confidence: 0.95,
    executionType: "sequential"
  },
  response: "✅ Successfully fetched 5 GitHub issues and emailed them to team@company.com"
}
```

### Single-Step Response (Legacy)
```javascript
{
  success: true,
  workflowType: "single_step", 
  identifiedApp: "gmail",
  identifiedAction: "send_email",
  confidence: 0.95,
  executionResult: {...},
  response: "✅ Email sent successfully"
}
```

## Error Handling

### Planning Errors
- Invalid app identification
- Unable to create execution plan
- Missing action definitions

### Validation Errors
- Missing app connections
- Invalid plan structure
- Insufficient permissions

### Execution Errors
- Step execution failures
- Parameter mapping errors
- Dependency resolution failures

### Error Response Structure
```javascript
{
  success: false,
  error: {
    node: "executeStep",
    step: 2,
    message: "Failed to execute gmail.send_email",
    missingConnections: ["gmail"]
  },
  partialResults: [...], // Results from successful steps
  workflowType: "multi_step"
}
```

## Configuration

### Database Requirements
- Apps stored in `Tool` collection with `slug`, `name`, `description`
- Actions linked to apps via `slug` field
- Connected accounts available via Composio SDK

### Environment Variables
```env
GROQ_API_KEY=your_groq_key
COMPOSIO_API_KEY=your_composio_key
MONGODB_URI=your_mongodb_uri
```

## Testing

### Test Multi-Step Workflows
```bash
node test_multi_step_workflow.js
```

### Test Specific Scenarios
```javascript
import { testMultiStepWorkflows, testWorkflowPlanning } from './test_multi_step_workflow.js';

await testMultiStepWorkflows();
await testWorkflowPlanning();
```

## Migration Guide

### From Single-Step to Multi-Step

**Before:**
```javascript
const result = await runAIClassificationAgent("Send email", options);
console.log(result.identifiedApp);  // "gmail"
```

**After:**
```javascript
const result = await runAIClassificationAgent("Send email", options);
console.log(result.workflowType);   // "single_step" or "multi_step"

if (result.workflowType === "multi_step") {
  console.log(result.requiredApps);  // ["gmail"]
  console.log(result.stepResults);   // Execution details
} else {
  console.log(result.identifiedApp); // "gmail" (legacy)
}
```

### API Compatibility
- All existing API endpoints remain unchanged
- Response structure extended with new fields
- Legacy fields maintained for backward compatibility

## Best Practices

### 1. **Workflow Design**
- Keep workflows focused and logical
- Minimize cross-step dependencies
- Plan for error recovery

### 2. **Parameter Mapping**
- Use clear parameter names
- Validate parameter flow between steps
- Handle missing parameters gracefully

### 3. **Performance**
- Monitor workflow execution time
- Implement appropriate timeouts
- Cache frequently used plans

### 4. **Error Handling**
- Implement retry logic for transient failures
- Provide clear error messages
- Support partial workflow recovery

## Future Enhancements

### Planned Features
1. **Parallel Step Execution**: Execute independent steps concurrently
2. **Conditional Workflows**: Branch based on step results
3. **Workflow Templates**: Pre-defined common patterns
4. **Visual Workflow Builder**: UI for workflow creation
5. **Workflow Analytics**: Performance and success metrics

### Extension Points
- Custom workflow validators
- Step execution plugins
- Result transformation hooks
- Custom aggregation strategies

## Troubleshooting

### Common Issues

**Issue**: "Missing connections for apps"
- **Solution**: Ensure all required apps are connected via Composio

**Issue**: "Invalid execution plan structure"
- **Solution**: Check LLM responses and validation logic

**Issue**: "Step execution timeout"
- **Solution**: Increase timeout values or optimize step logic

**Issue**: "Parameter mapping failed"
- **Solution**: Validate parameter names and data types

### Debug Mode
Enable debug mode for detailed logging:
```javascript
const result = await runAIClassificationAgent(input, {
  ...options,
  debug: true
});
```

### Logging
Monitor workflow execution:
- Planning phase logs
- Step execution logs
- Parameter mapping logs
- Error detail logs
