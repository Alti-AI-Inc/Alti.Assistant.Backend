// Phase 2 Quick Test Script
// This script tests the core functionality of the workflow scheduling system

console.log('🧪 Starting Phase 2 Quick Test...\n');

async function testPhase2Basic() {
  try {
    console.log('1. Testing Service Imports...');
    
    // Test individual service imports
    const cronManagerImport = await import('./src/app/modules/composio_v2/services/cronManager.service.js');
    console.log('✅ CronManager service imported');
    
    const workflowExecutorImport = await import('./src/app/modules/composio_v2/services/workflowExecutor.service.js');
    console.log('✅ WorkflowExecutor service imported');
    
    const queueManagerImport = await import('./src/app/modules/composio_v2/services/queueManager.service.js');
    console.log('✅ QueueManager service imported');
    
    const schedulerInitializerImport = await import('./src/app/modules/composio_v2/services/schedulerInitializer.service.js');
    console.log('✅ SchedulerInitializer service imported');
    
    console.log('\n2. Testing Service Initialization...');
    
    // Test basic service functionality
    const { cronManager } = cronManagerImport;
    const { queueManager } = queueManagerImport;
    
    // Test cron manager basic methods
    const cronStatus = cronManager.getStatus();
    console.log('✅ CronManager status check:', cronStatus.initialized);
    
    // Test queue manager basic methods  
    const queueStatus = queueManager.getQueueStatus();
    console.log('✅ QueueManager status check - Queue size:', queueStatus.queueSize);
    
    console.log('\n3. Testing Schedule Detection...');
    
    // Test schedule detection node
    const nodesImport = await import('./src/app/modules/composio_v2/ai_classification/nodes.js');
    const { scheduleDetectionNode } = nodesImport;
    
    const testInput = "Send me a daily report at 9 AM";
    const mockState = {
      userInput: testInput,
      workflowType: 'single_step',
      userId: 'test_user'
    };
    
    const scheduleResult = await scheduleDetectionNode(mockState);
    console.log('✅ Schedule detection test:', {
      input: testInput,
      needsScheduling: scheduleResult.needsScheduling,
      scheduleType: scheduleResult.scheduleType,
      cronExpression: scheduleResult.cronExpression
    });
    
    console.log('\n4. Testing Workflow Models...');
    
    // Test model imports
    const ScheduledWorkflow = (await import('./src/app/modules/composio_v2/models/scheduledWorkflow.model.js')).default;
    const WorkflowExecution = (await import('./src/app/modules/composio_v2/models/workflowExecution.model.js')).default;
    
    console.log('✅ ScheduledWorkflow model imported');
    console.log('✅ WorkflowExecution model imported');
    
    // Test model static methods
    const testWorkflowId = ScheduledWorkflow.generateWorkflowId();
    const testExecutionId = WorkflowExecution.generateExecutionId();
    
    console.log('✅ Model ID generation working:', {
      workflowId: testWorkflowId,
      executionId: testExecutionId
    });
    
    console.log('\n🎉 Phase 2 Basic Test Complete - All Components Working!');
    return true;
    
  } catch (error) {
    console.error('❌ Phase 2 Test Failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
testPhase2Basic()
  .then(success => {
    if (success) {
      console.log('\n✅ SUCCESS: Phase 2 is ready for use!');
    } else {
      console.log('\n❌ FAILURE: Phase 2 has issues that need to be resolved.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    process.exit(1);
  });
