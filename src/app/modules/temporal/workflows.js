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

const {
  generateSearchQueriesActivity,
  executeExaSearchesActivity,
  scrapeAndIndexActivity,
  synthesizeReportActivity
} = proxyActivities({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  }
});

/**
 * Autonomous Deep Research Workflow
 * Coordinates multi-agent sub-queries, web scraping, vector ingestion, and synthesis.
 */
export async function deepResearchWorkflow(topic, collectionId) {
  // Step 1: Break topic into parallel search queries
  const queries = await generateSearchQueriesActivity(topic);
  
  // Step 2: Use Exa to find the best URLs for those queries
  const urls = await executeExaSearchesActivity(queries);
  
  // Step 3: OpenClaw web-crawls the URLs and ingests them into LlamaIndex
  if (urls.length > 0) {
    await scrapeAndIndexActivity(urls, collectionId);
  }
  
  // Step 4: Synthesize the findings via Groq LLM against the LlamaIndex vector store
  const finalReport = await synthesizeReportActivity(collectionId, topic);
  
  return finalReport;
}
