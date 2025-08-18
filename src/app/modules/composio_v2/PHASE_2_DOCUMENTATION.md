# Phase 2 Implementation - Workflow Scheduling System

## Overview

Phase 2 extends the Composio v2 module with a complete **automated workflow scheduling system**. This phase implements the actual execution infrastructure that enables workflows to run automatically based on schedules (daily, weekly, one-time) or manual triggers.

## Architecture

### Core Components

```
Phase 2 Architecture:
┌─────────────────────────────────────────────────────────────────┐
│                    AI Classification (Enhanced)                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ Schedule        │    │ Workflow        │    │ Response     │ │
│  │ Detection Node  │ -> │ Save Node       │ -> │ Generation   │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Scheduling System                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ Cron Manager    │    │ Queue Manager   │    │ Workflow     │ │
│  │ Service         │ <->│ Service         │ <->│ Executor     │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           │                       │                      │      │
│           ▼                       ▼                      ▼      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ Schedule        │    │ Execution       │    │ Multi-Step   │ │
│  │ Management      │    │ Queue           │    │ Workflows    │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Layer                             │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Scheduled       │    │ Workflow        │                    │
│  │ Workflows       │    │ Executions      │                    │
│  └─────────────────┘    └─────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Features Implemented

### 1. Intelligent Schedule Detection
- **AI-powered scheduling parsing** from natural language
- **Multiple schedule types**: recurring (cron), one-time, manual triggers
- **Timezone support** with automatic detection
- **Confidence scoring** for schedule interpretation

### 2. Workflow Execution Engine
- **Single-step execution** for simple automations
- **Multi-step workflows** with dependency management
- **Cross-step parameter passing** between workflow steps
- **Connection validation** before execution
- **Real-time execution tracking** with detailed logs

### 3. Advanced Queue Management
- **Priority-based queuing** (high, normal, low)
- **Concurrent execution limits** (configurable)
- **Retry logic** with exponential backoff
- **Execution statistics** and performance metrics
- **Queue monitoring** and management APIs

### 4. Robust Cron Scheduling
- **Multiple timezone support** with automatic DST handling
- **One-time and recurring schedules** 
- **Job lifecycle management** (start, stop, reschedule)
- **Health monitoring** and cleanup jobs
- **Graceful shutdown** handling

### 5. System Integration
- **Startup initialization** that loads active workflows
- **Health checks** for all components
- **Comprehensive logging** and error handling
- **Emergency controls** for system management

## Services Overview

### CronManager Service (`cronManager.service.js`)
**Purpose**: Handles time-based scheduling and cron job management

**Key Methods**:
- `scheduleWorkflow()` - Schedule recurring workflows
- `scheduleOneTimeWorkflow()` - Schedule one-time executions
- `unscheduleWorkflow()` - Remove scheduled workflows
- `getJobStatus()` - Get current job information
- `healthCheck()` - Monitor system health

**Features**:
- ✅ Multiple timezone support
- ✅ Cleanup jobs for maintenance
- ✅ Job status tracking
- ✅ Graceful shutdown handling

### WorkflowExecutor Service (`workflowExecutor.service.js`)
**Purpose**: Executes saved workflows with full state management

**Key Methods**:
- `executeWorkflow()` - Execute any workflow type
- `executeSingleStepWorkflow()` - Handle single-step execution
- `executeMultiStepWorkflow()` - Handle complex multi-step workflows
- `validateConnections()` - Ensure required app connections exist
- `cancelExecution()` - Stop running executions

**Features**:
- ✅ Single and multi-step workflow support
- ✅ Cross-step parameter resolution
- ✅ Dependency management
- ✅ Connection validation
- ✅ Execution statistics

### QueueManager Service (`queueManager.service.js`)
**Purpose**: Manages workflow execution queuing and concurrency

**Key Methods**:
- `queueWorkflow()` - Add workflow to execution queue
- `processQueue()` - Process queued workflows
- `getQueueStatus()` - Get current queue state
- `cancelQueuedWorkflow()` - Cancel pending executions
- `clearQueue()` - Emergency queue clearing

**Features**:
- ✅ Priority-based queuing
- ✅ Configurable concurrency limits
- ✅ Retry logic with backoff
- ✅ Queue monitoring
- ✅ Stale execution cleanup

### SchedulerInitializer Service (`schedulerInitializer.service.js`)
**Purpose**: System startup, shutdown, and overall orchestration

**Key Methods**:
- `initialize()` - Start all scheduling components
- `loadActiveWorkflows()` - Load workflows from database
- `reloadWorkflows()` - Runtime workflow refresh
- `executeWorkflowManually()` - Manual trigger execution
- `healthCheck()` - Overall system health

**Features**:
- ✅ Automatic workflow loading on startup
- ✅ Graceful shutdown handling
- ✅ Runtime workflow management
- ✅ Manual execution triggers
- ✅ System health monitoring

## Enhanced AI Classification

### New Nodes Added

#### Schedule Detection Node (`scheduleDetectionNode`)
**Purpose**: Analyzes user input for scheduling requirements
- Detects scheduling language ("daily", "every Monday", "at 9 AM")
- Generates cron expressions
- Determines schedule types (recurring/one-time)
- Provides confidence scores

#### Save Workflow Node (`saveWorkflowNode`) 
**Purpose**: Saves workflows for scheduled execution
- Creates database records for workflows
- Sets up scheduling metadata
- Generates user-friendly responses
- Handles save errors gracefully

### Enhanced Workflow Routing
```javascript
// New routing logic
START -> plan_workflow -> schedule_detection -> [conditional routing]
                                             |
                                             ├─ save_workflow (if scheduling detected)
                                             ├─ validate_plan (if multi-step, no scheduling)
                                             └─ classify_app (if single-step, no scheduling)
```

## Database Integration

### Models Enhanced
- ✅ **ScheduledWorkflow** - Stores workflow definitions with scheduling info
- ✅ **WorkflowExecution** - Tracks execution history and results
- ✅ Indexes for performance optimization
- ✅ Virtual fields for computed values
- ✅ Instance methods for lifecycle management

## Usage Examples

### 1. Scheduling a Recurring Workflow
```javascript
// User input: "Send me a weekly GitHub issues summary every Monday at 9 AM"
const result = await runAIClassificationAgent(
  "Send me a weekly GitHub issues summary every Monday at 9 AM",
  { userId: "user123" }
);

// Result:
{
  success: true,
  workflowSaved: true,
  savedWorkflowId: "workflow_abc123",
  scheduleType: "recurring",
  cronExpression: "0 9 * * MON"
}
```

### 2. One-time Scheduled Execution
```javascript
// User input: "Remind me to review issues tomorrow at 2 PM"
const result = await runAIClassificationAgent(
  "Remind me to review issues tomorrow at 2 PM",
  { userId: "user123" }
);

// Result:
{
  success: true,
  workflowSaved: true,
  scheduleType: "one_time",
  oneTimeDate: "2024-01-15T14:00:00Z"
}
```

### 3. Manual Workflow Trigger
```javascript
// Trigger a saved workflow manually
const result = await schedulerInitializer.executeWorkflowManually(
  "workflow_abc123",
  "user123",
  "Manual trigger via dashboard"
);
```

## System Management

### Health Monitoring
```javascript
// Check overall system health
const health = await healthCheck();
console.log(health.healthy); // true/false
console.log(health.components); // Individual component status
```

### Queue Management
```javascript
// Get queue status
const status = queueManager.getQueueStatus();
console.log(status.queueSize); // Number of pending workflows
console.log(status.runningExecutions); // Currently executing
console.log(status.estimatedWaitTime); // Wait time in ms
```

### Workflow Management
```javascript
// Get scheduled workflows for a user
const workflows = await workflowService.getUserWorkflows("user123");

// Pause/resume workflows
await workflowService.pauseWorkflow("workflow_abc123", "user123");
await workflowService.resumeWorkflow("workflow_abc123", "user123");
```

## Testing

### Integration Test Suite
Located in: `test/phase2_integration_test.js`

**Test Coverage**:
- ✅ Service initialization validation
- ✅ Workflow scheduling functionality
- ✅ Execution engine testing
- ✅ Queue management validation
- ✅ Schedule detection integration

**Run Tests**:
```javascript
import { runPhase2IntegrationTests } from './test/phase2_integration_test.js';

const results = await runPhase2IntegrationTests();
console.log(`Pass Rate: ${results.summary.passRate}`);
```

## Configuration

### Environment Variables
```bash
# Queue Configuration
QUEUE_MAX_CONCURRENT_EXECUTIONS=5
QUEUE_RETRY_ATTEMPTS=3

# Cron Configuration  
CRON_TIMEZONE=UTC
CRON_CLEANUP_INTERVAL=86400000

# Execution Configuration
EXECUTION_TIMEOUT=300000
EXECUTION_LOG_RETENTION_DAYS=30
```

### Service Configuration
```javascript
// Initialize with custom config
await initializeWorkflowScheduler({
  queue: {
    maxConcurrentExecutions: 10,
    retryAttempts: 5
  },
  cron: {
    timezone: 'America/New_York',
    cleanupInterval: 24 * 60 * 60 * 1000
  }
});
```

## Error Handling

### Comprehensive Error Management
- ✅ **Service-level errors** with detailed logging
- ✅ **Execution failures** with retry logic
- ✅ **Connection issues** with validation
- ✅ **Schedule conflicts** with resolution
- ✅ **Emergency controls** for system recovery

### Error Recovery Scenarios
1. **Workflow execution fails**: Automatic retry with exponential backoff
2. **Database connection lost**: Graceful degradation with reconnection
3. **Service crash**: Automatic cleanup of stale executions on restart
4. **Schedule conflicts**: Intelligent scheduling resolution
5. **Memory issues**: Queue size limits and cleanup procedures

## Performance Considerations

### Optimization Features
- ✅ **Efficient queuing** with priority management
- ✅ **Connection pooling** for database operations
- ✅ **Memory management** with execution limits
- ✅ **Index optimization** for database queries
- ✅ **Cleanup jobs** for maintenance

### Monitoring Metrics
- Execution success/failure rates
- Average execution times
- Queue wait times
- System resource usage
- Active workflow counts

## Security

### Security Measures Implemented
- ✅ **User isolation** - Users can only access their workflows
- ✅ **Input validation** - All user inputs are validated
- ✅ **Connection verification** - App connections verified before execution
- ✅ **Error sanitization** - Sensitive data removed from error messages
- ✅ **Rate limiting** - Execution limits prevent abuse

## Future Enhancements

### Planned Features
- 🔄 **Workflow templates** for common patterns
- 🔄 **Advanced scheduling** (business days, holidays)
- 🔄 **Workflow dependencies** between different workflows
- 🔄 **Performance analytics** dashboard
- 🔄 **Workflow sharing** between users
- 🔄 **Conditional execution** based on data
- 🔄 **Parallel step execution** for complex workflows

## Troubleshooting

### Common Issues

1. **Workflows not executing**
   - Check cron manager status: `cronManager.getStatus()`
   - Verify schedule format: Use online cron validators
   - Check user connections: `workflowExecutor.validateConnections()`

2. **Queue backing up**
   - Monitor queue status: `queueManager.getQueueStatus()`
   - Increase concurrent executions if resources allow
   - Check for failed executions blocking the queue

3. **Execution failures**
   - Review execution logs in database
   - Verify app connections are active
   - Check for parameter mapping issues

### Debug Mode
```javascript
// Enable debug logging
process.env.DEBUG = "composio:*";

// Check system status
const status = getSystemStatus();
console.log(JSON.stringify(status, null, 2));
```

## Integration Points

### Main Application Integration
```javascript
// In your main app.js or server.js
import { initializeWorkflowScheduler } from './src/app/modules/composio_v2/scheduler.js';

// Initialize during app startup
app.listen(port, async () => {
  await initializeWorkflowScheduler();
  console.log('Server and workflow scheduler ready');
});
```

### API Integration
The existing Composio v2 API endpoints in `workflow.routes.js` provide full CRUD operations for scheduled workflows, making them accessible via REST API.

---

## Summary

Phase 2 successfully implements a **production-ready workflow scheduling system** with:

- ✅ **Intelligent scheduling** from natural language
- ✅ **Robust execution engine** for complex workflows  
- ✅ **Advanced queue management** with priorities
- ✅ **Reliable cron scheduling** with timezone support
- ✅ **Comprehensive testing** and monitoring
- ✅ **Enterprise-grade error handling** and recovery

The system is designed for **scalability**, **reliability**, and **ease of use**, enabling users to create sophisticated automated workflows with simple natural language commands.

**Next Steps**: The foundation is now ready for advanced features like workflow templates, conditional execution, and performance analytics dashboards.
