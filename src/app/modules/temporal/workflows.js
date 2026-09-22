import { proxyActivities, sleep } from '@temporalio/workflow';

// Define typed activities proxy for workflow sandbox
const { 
  syncStripeProductsActivity, 
  pollExaMonitorsActivity, 
  cleanupTempUploadsActivity 
} = proxyActivities({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '10s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  }
});

/**
 * Workflow to synchronize Stripe products
 */
export async function syncStripeProductsWorkflow() {
  const result = await syncStripeProductsActivity();
  return result;
}

/**
 * Workflow to poll Exa monitors
 */
export async function pollExaMonitorsWorkflow() {
  const result = await pollExaMonitorsActivity();
  return result;
}

/**
 * Workflow to clean up Liberty Center One object storage
 */
export async function cleanupTempUploadsWorkflow() {
  const result = await cleanupTempUploadsActivity();
  // Simulate doing multiple chunks with sleeps
  await sleep('10 seconds');
  return result;
}
