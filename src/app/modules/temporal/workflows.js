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

const repoActivities = proxyActivities({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumAttempts: 2,
  }
});

/**
 * Autonomous Private Repository Intelligence Workflow
 * Clones, Indexes, and Analyzes complex codebases using OpenClaw + LlamaIndex + Groq
 */
export async function repositoryIntelligenceWorkflow(repoUrl, query, collectionId) {
  // Step 1: Clone and extract repo map (OpenClaw native)
  const repoData = await repoActivities.fetchRepositoryFilesActivity(repoUrl);
  
  // Step 2: Ingest the source files into local vector storage (LlamaIndex)
  await repoActivities.indexRepositoryActivity(repoData.repoPath, collectionId);
  
  // Step 3: Analyze the codebase with high-context reasoning (Groq RAG)
  const analysisReport = await repoActivities.analyzeRepositoryActivity(collectionId, repoUrl, query);
  
  return analysisReport;
}

const dataActivities = proxyActivities({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '2s',
    backoffCoefficient: 2,
    maximumAttempts: 2,
  }
});

/**
 * Autonomous Data Analysis Workflow
 * Generates code to solve a prompt, executes it natively in a sandbox, and synthesizes the output.
 */
export async function dataAnalysisWorkflow(prompt) {
  // Step 1: Generate the script
  const scriptData = await dataActivities.generateDataAnalysisCodeActivity(prompt);
  
  // Step 2: Execute in VM sandbox
  const execution = await dataActivities.executeSandboxedCodeActivity(scriptData.code);
  
  // Step 3: Synthesize output
  const finalAnswer = await dataActivities.synthesizeDataAnalysisActivity(prompt, scriptData.code, execution);
  
  return {
    prompt,
    code_executed: scriptData.code,
    raw_output: execution.output,
    final_answer: finalAnswer,
    error: execution.error || null
  };
}

/**
 * AGI Master Orchestrator
 * Routes high-level user intents to:
 * 1. Exa (Web Search)
 * 2. Composio (App Integration)
 * 3. OpenClaw Edge (Local Computer Desktop App via Liberty Center VMs)
 * 4. Codex (Code Sandboxing)
 */
export async function agiOrchestratorWorkflow(prompt, context = {}) {
  // 1. Analyze prompt intent (Usually done via an activity)
  const analysis = await dataActivities.generateDataAnalysisCodeActivity(`You are an AGI router. Where should this prompt go? 
Return ONLY ONE of these literal strings: WEB, APP, DESKTOP, MATH.
Prompt: "${prompt}"`);
  
  const route = analysis.code.toUpperCase().trim();
  let result = null;

  if (route.includes('WEB')) {
    result = await repoActivities.analyzeRepositoryActivity(`exa-pool`, `web`, prompt);
  } else if (route.includes('APP')) {
    result = { action: 'Dispatched to Composio App Router', prompt };
  } else if (route.includes('DESKTOP')) {
    result = { action: 'Queued to Edge Desktop App', machineId: context.machineId || 'default-vm' };
  } else {
    // Math/Code fallback
    const script = await dataActivities.generateDataAnalysisCodeActivity(prompt);
    result = await dataActivities.executeSandboxedCodeActivity(script.code);
  }

  // Synthesize final result
  return {
    prompt,
    routed_to: route,
    raw_result: result,
    status: 'COMPLETED_AGI_ROUTING'
  };
}

const agiActivities = proxyActivities({
  startToCloseTimeout: '15 minutes', // Long timeout because EDGE tasks can take time for the desktop app to process
  retry: {
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumAttempts: 2,
  }
});

/**
 * Advanced AGI Master Orchestrator (World Best)
 * Employs DAG-based dynamic planning across all 5 infrastructural pillars.
 */
export async function advancedAgiWorkflow(prompt, context = {}) {
  // 1. Generate the multi-system execution plan
  const plan = await agiActivities.generateAgiPlanActivity(prompt);
  
  if (!plan || plan.length === 0) {
    return { prompt, status: 'FAILED', error: 'AGI failed to construct a valid execution graph.' };
  }

  const executionResults = {};

  // 2. Execute the DAG (Naive sequential implementation for reliability)
  for (const step of plan) {
    // Inject previous context so dependent steps have upstream data
    const contextualizedStep = {
      ...step,
      action: `${step.action}\n\nContext from previous steps: ${JSON.stringify(executionResults)}`
    };

    const dispatchResult = await agiActivities.dispatchAgiStepActivity(contextualizedStep, context);
    
    // If it routed to a desktop or VM, we pause the Temporal workflow and wait for the Edge Node!
    if (dispatchResult.status === 'queued' && dispatchResult.commandId) {
      const edgeResult = await agiActivities.waitForEdgeCommandActivity(dispatchResult.commandId);
      executionResults[step.id] = edgeResult;
    } else {
      executionResults[step.id] = dispatchResult;
    }
  }

  // 3. Synthesize the grand unified output using Codex Data synthesis activity
  const synthesisPrompt = `The user asked: "${prompt}"\nI executed this comprehensive AGI plan:\n${JSON.stringify(plan)}\n\nHere are the results from the various subsystems (Web, Desktop, Cloud, Apps):\n${JSON.stringify(executionResults)}\n\nSynthesize the final, definitive answer.`;
  const finalAnswer = await dataActivities.synthesizeDataAnalysisActivity(prompt, "N/A - Orchestrated AGI Plan", { output: synthesisPrompt });

  return {
    prompt,
    plan,
    raw_results: executionResults,
    final_answer: finalAnswer,
    status: 'COMPLETED_AGI_EXECUTION'
  };
}
