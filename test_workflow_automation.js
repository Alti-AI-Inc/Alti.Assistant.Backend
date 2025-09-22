import { composioIntegrationService } from './src/app/modules/workflow_automation/services/composioIntegration.service.js';
import { logger } from './src/shared/logger.js';

/**
 * Test script for workflow automation module
 */
async function testWorkflowAutomation() {
  try {
    console.log('🚀 Testing Workflow Automation Module...\n');

    // Test user ID (replace with actual user ID for testing)
    const testUserId = '60a8b8e8e8e8e8e8e8e8e8e8';

    console.log('1. Testing getUserAvailableApps...');
    const appsResult = await composioIntegrationService.getUserAvailableApps(testUserId);
    console.log('Apps Result:', {
      success: appsResult.success,
      connectedAppsCount: appsResult.connectedApps?.length || 0,
      availableAppsCount: appsResult.availableApps?.length || 0,
      error: appsResult.error || 'None'
    });

    console.log('\n2. Testing getUserAvailableTools...');
    const toolsResult = await composioIntegrationService.getUserAvailableTools(testUserId);
    console.log('Tools Result:', {
      success: toolsResult.success,
      totalTools: toolsResult.tools?.length || 0,
      appCount: Object.keys(toolsResult.toolsByApp || {}).length,
      error: toolsResult.error || 'None'
    });

    console.log('\n3. Testing checkAppConnections...');
    const testApps = ['gmail', 'slack', 'calendar'];
    const connectionsResult = await composioIntegrationService.checkAppConnections(testUserId, testApps);
    console.log('Connections Result:', {
      success: connectionsResult.success,
      connections: connectionsResult.connections || {},
      error: connectionsResult.error || 'None'
    });

    console.log('\n4. Testing validateDetectedApps...');
    const detectedApps = [
      { app: 'gmail', confidence: 0.9, action: 'send_email' },
      { app: 'slack', confidence: 0.8, action: 'send_message' }
    ];
    const validationResult = await composioIntegrationService.validateDetectedApps(testUserId, detectedApps);
    console.log('Validation Result:', {
      success: validationResult.success,
      validatedCount: validationResult.validatedApps?.length || 0,
      error: validationResult.error || 'None'
    });

    console.log('\n✅ Workflow Automation Module Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logger.error('Workflow automation test error:', error);
  }
}

// Run the test
testWorkflowAutomation();