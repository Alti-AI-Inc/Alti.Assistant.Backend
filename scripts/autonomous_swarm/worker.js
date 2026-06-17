import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { readFileContent, writeFileContent, getAllJSFiles } from '../autonomous_agent/fileManager.js';
import { runTests } from '../autonomous_agent/verifier.js';
import { commitAndPush } from '../autonomous_agent/gitManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendPath = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(backendPath, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_SECRET_KEY });

// Get configuration from environment variables
const AGENT_TYPE = process.env.AGENT_TYPE || 'fixer'; // fixer, tester, optimizer, documenter
const ZONE_ID = process.env.ZONE_ID || '1';
const ASSIGNED_MODULES = JSON.parse(process.env.ASSIGNED_MODULES || '[]');
const MODEL_NAME = process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro'; // Upgrade to Pro model to leverage user's Ultra subscription plan

console.log(`Starting Swarm Worker - Type: ${AGENT_TYPE.toUpperCase()}, Zone: ${ZONE_ID}, Modules: ${ASSIGNED_MODULES.join(', ')}`);

const PROMPTS = {
  fixer: `You are an elite automated security and bug-fixing AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Identify any bugs, security vulnerabilities (like IDOR, SQLi, unhandled promises), or integration issues.
CRITICAL INTEGRATION TASK: Ensure that all roles (super_admin/platform owner, admin/workspace owner, manager, user) are properly validated. Ensure that actions taken by users correctly propagate usage details, limits, and notifications up to their managers and administrators, and respect tenant context boundaries.
If you find NO bugs or integration issues, reply EXACTLY with: "NO_BUGS_FOUND".
If you DO find a bug or hierarchy gap, provide the ENTIRE updated file content, incorporating the fix. Do NOT provide explanations outside of code comments. The output MUST ONLY be the corrected valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  tester: `You are an elite automated QA Engineer AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to write comprehensive unit tests using "vitest".
Ensure that your tests mock and cover role-based access checks (super_admin, admin, manager, user) and check context boundaries.
If the file already has excellent test coverage, or if it's a file that shouldn't be tested (like an index export file or config file), reply EXACTLY with: "NO_TESTS_NEEDED".
Otherwise, write a complete, standalone .test.js file that mocks necessary dependencies and tests the core logic.
The output MUST ONLY be the valid test code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  optimizer: `You are an elite automated Database & Performance Optimizer AI.
Analyze the following JavaScript file from a Node.js/Express backend that uses Mongoose.
Your task is to identify slow database queries (e.g., missing .lean(), missing indexing recommendations, or N+1 query problems) or CPU-intensive synchronous loops.
Pay special attention to queries that fetch tenant details or check cross-user statistics for managers/admins.
If the file is already highly optimized or doesn't interact with the database/heavy compute, reply EXACTLY with: "NO_OPTIMIZATIONS_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the optimizations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  documenter: `You are an elite automated Code Documenter AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to add rich JSDoc comments to all functions, classes, and exported constants.
Ensure you document any role-based permissions or multi-tenant context required for the endpoints or services.
If the file is a controller or route file, add OpenAPI/Swagger annotations as JSDoc comments above the endpoints.
If the file is already fully and excellently documented, reply EXACTLY with: "NO_DOCUMENTATION_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the new documentation comments. Do NOT modify the core execution logic of the code at all. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  user_agent: `You are an elite User Platform Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify and optimize the End-User experience: prompt execution, chat sessions, user profile management, user usage metrics, and personal file storage.
Ensure that user prompts execute without errors, respect user-level limits, and keep the user's data isolated.
If you find no gaps or improvements needed, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the improvements. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  manager_agent: `You are an elite Manager Platform Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify and optimize the Manager dashboard features: team management, invitations, workspace metrics, and role updates.
Ensure that managers can invite members, view metrics inside their workspace, and manage roles without exceeding their plan limits or accessing billing information.
If you find no gaps or improvements needed, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the improvements. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  admin_agent: `You are an elite Admin Platform Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify and optimize the Admin/Workspace Owner features: billing settings, subscription management (Stripe), workspace name/slug updates, and limits.
Ensure that admins can manage subscriptions, update workspace configurations, and configure payment details securely.
If you find no gaps or improvements needed, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the improvements. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  owner_agent: `You are an elite Platform Owner / Super Admin Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify and optimize the Platform Owner features: global oversight, tenant suspension/unsuspension, system-wide configuration, and global logs.
Ensure that the Platform Owner has full access to override tenant limits, manage all tenants, view global statistics, and configure platform settings.
If you find no gaps or improvements needed, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the improvements. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  security_agent: `You are an elite Enterprise Security Audit Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit and patch security issues: SQL/NoSQL injection, cross-site scripting (XSS), missing CORS headers, input sanitization, insecure encryption, and hardcoded secrets/API keys.
If you find no vulnerabilities or security gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the security patches. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  telemetry_agent: `You are an elite Enterprise Telemetry & Error Handling Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to review and patch error handling and logging. Ensure all async operations are properly try/caught, errors are logged to Winston/GCP logging using logger.error, and internal system error stack traces are normalized (using ApiError) before being returned to users.
If you find no error handling or logging gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the robust error handling and logging. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  ratelimit_agent: `You are an elite Enterprise Rate-Limiting & DDOS Guard Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify and apply rate-limiting constraints to public and authenticated endpoints (e.g., using Redis rate limiters). Protect the routes from DDOS attempts, API abuse, and excessive cost runaway.
If you find no rate-limiting gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the rate limiter bindings. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  patch_agent: `You are an elite Enterprise Dependency & CVE Patching Agent AI.
Analyze the following package file or configuration file.
Your task is to identify packages with known vulnerabilities (CVEs) and safely recommend patch/minor version updates that maintain compatibility with tests.
If you find no outdated or vulnerable dependencies, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the dependency updates. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_secret_agent: `You are an elite GCP Secret Manager Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to ensure the app never reads credentials from local files in production. Audit and update configuration and database connections to dynamically resolve API keys, Mongo URIs, and Stripe secrets using GCP Secret Manager (@google-cloud/secret-manager) or environment variables injected by Cloud Run.
If you find no configuration or secrets exposure gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the GCP Secret Manager integrations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_logging_agent: `You are an elite GCP Stackdriver Logging Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit Winston/Morgan logging formats. Ensure all application logs are outputted as Structured JSON compatible with GCP Cloud Logging (Stackdriver). Ensure proper severity keys (INFO, WARNING, ERROR) are utilized so that Cloud Logging can parse them automatically.
If you find no logging formatting gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the Stackdriver structured logging format. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_storage_agent: `You are an elite GCP Cloud Storage stateless Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit all file and media handling. Ensure the backend never writes files to the local ephemeral container filesystem. Rewrite file generation, image/video uploads, and exports to write and stream directly to Google Cloud Storage (GCS) buckets (@google-cloud/storage) using signed URLs.
If you find no local filesystem writes or GCS integration gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating GCS streaming logic. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_pubsub_agent: `You are an elite GCP Pub/Sub & Cloud Tasks Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to ensure long-running workflows or background jobs are never processed in-memory. Rewrite background tasks, notifications, and heavy calculations to offload asynchronously via GCP Pub/Sub or Google Cloud Tasks, ensuring stateless, container-friendly scale.
If you find no in-memory execution or Pub/Sub integration gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating GCP Pub/Sub/Cloud Tasks offloading. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_iam_agent: `You are an elite GCP IAM & Service Account Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to ensure the codebase relies on Application Default Credentials (ADC) rather than hardcoded Service Account JSON keys. Audit and update Google API clients (Secret Manager, GCS, Vertex AI) to connect without hardcoded credential paths.
If you find no IAM or hardcoded key violations, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating Application Default Credentials. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  vertex_safety_agent: `You are an elite Vertex AI & Safety Guard Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit all model generation code. Ensure model calls use the enterprise Vertex AI SDK (@google-cloud/vertexai), explicitly configure Google's safety settings (hate speech, harassment filter thresholds), and filter out or mask PII (Personally Identifiable Information) before transmitting data.
If you find no safety setting or Vertex AI gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating Vertex AI safety settings. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_health_agent: `You are an elite GCP Cloud Run Health Check & Graceful Shutdown Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to ensure the Express server handles Cloud Run scaling gracefully. Audit and update the startup/shutdown code to bind to process.env.PORT, expose liveness (/healthz) and readiness (/readyz) probes, and listen to SIGTERM signals to close database connections and wait for active requests before shutting down.
If you find no Cloud Run lifecycle or probe gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating graceful shutdown and probes. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  gcp_db_agent: `You are an elite GCP Database Resiliency Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit database connection configurations. Ensure connection strings utilize production connection pooling settings, automatic reconnects, socket timeouts, and keepAlive parameters optimized for GCP network routing (such as VPC peering or Cloud SQL Auth Proxy).
If you find no connection or pooling optimization gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the database resiliency configurations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  tenant_isolation_agent: `You are an elite Multi-Tenant Isolation Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit and enforce strict tenant boundaries. Ensure that all queries, database lookups, and context lookups explicitly partition data by tenant (e.g. check for presence of tenantId/workspaceId checks in queries and ensure no cross-tenant data leaks can occur).
If you find no tenant isolation gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the isolation fixes. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  compliance_agent: `You are an elite Compliance & GDPR Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to review personal data handling and ensure compliance with GDPR/HIPAA standards. Audit files for correct PII masking, data logging protocols (ensure sensitive user fields like passwords, full names, or tokens are never logged in plain text), and ensure data retention or deletion hooks are respected.
If you find no compliance or PII gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the compliance fixes. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  prompt_security_agent: `You are an elite Prompt Security & Injection Guard Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to audit prompt generation and AI service invocations. Look for potential prompt injection vulnerabilities, verify that model inputs are correctly sanitized or structured, and ensure safety settings (harassment, hate speech, etc.) are explicitly configured in model API parameters.
If you find no prompt security or injection gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating prompt sanitization or safety configuration fixes. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  resiliency_agent: `You are an elite System Resiliency & Circuit Breaker Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to inspect external service integrations (API calls, microservices, third-party libraries). Ensure that external requests are protected by appropriate timeouts, retry policies (e.g. exponential backoff), and circuit breakers to prevent cascading failures.
If you find no resiliency gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating retry/circuit-breaker configurations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  performance_agent: `You are an elite Code Performance & Memory Profiler Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to detect CPU-blocking synchronous actions, memory leaks (e.g. uncleared timers, growing closures), or inefficient iteration over large data collections. Suggest or apply async alternatives and stream-based data handling where applicable.
If you find no performance or memory bottlenecks, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the performance improvements. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  cache_agent: `You are an elite Caching & Redis Integration Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to optimize latency by integrating caching strategies. Check for high-frequency database lookups or compute-heavy endpoints and recommend/implement Redis-based caching with appropriate expiration policies (TTL) and cache-invalidation hooks.
If you find no caching gaps or improvements needed, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating caching layer integrations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  billing_audit_agent: `You are an elite Billing Integrity & Webhook Auditor Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to verify subscription state logic and webhook verification. Ensure Stripe (or other payment processor) webhook endpoints verify signature authenticity, prevent replay attacks, gracefully handle event processing idempotency, and correctly sync usage metrics or subscription statuses.
If you find no billing or signature verification gaps, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating security and reliability fixes for billing. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  db_tuner_agent: `You are an elite Mongoose & DB Tuner Agent AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to analyze schema and query design. Ensure Mongoose schemas are equipped with optimal indexes (including compound indexes for filtered/sorted queries), use select() to avoid fetching unnecessary fields, and avoid unindexed queries that cause full collection scans.
If you find no indexing or schema optimization opportunities, reply EXACTLY with: "NO_CHANGES_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the tuned database schemas or queries. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runLoop() {
  const modulesPath = path.join(backendPath, 'src/app/modules');
  
  while (true) {
    try {
      console.log(`[Zone ${ZONE_ID}] Scanning files...`);
      const allFiles = await getAllJSFiles(modulesPath);
      
      // Filter files to only target ASSIGNED_MODULES
      const targetedFiles = allFiles.filter(file => {
        return ASSIGNED_MODULES.some(modName => {
          const pathSegment = path.join('src', 'app', 'modules', modName);
          return file.includes(pathSegment);
        });
      });

      if (targetedFiles.length === 0) {
        console.log(`[Zone ${ZONE_ID}] No files found in assigned modules. Waiting...`);
        await sleep(300000); // 5 minutes sleep if no files
        continue;
      }

      // Shuffle files
      targetedFiles.sort(() => 0.5 - Math.random());

      for (const filePath of targetedFiles) {
        // Skip test files for non-tester roles
        if (AGENT_TYPE !== 'tester' && (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js'))) {
          continue;
        }

        // Handle Tester specifically
        if (AGENT_TYPE === 'tester') {
          if (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js')) {
            continue;
          }
          const testFilePath = filePath.replace('.js', '.test.js');
          let testExists = true;
          try {
            await fs.access(testFilePath);
          } catch {
            testExists = false;
          }
          if (testExists) continue;

          console.log(`[Zone ${ZONE_ID}] [Tester] Analyzing ${filePath}...`);
          const content = await readFileContent(filePath);
          if (content.length > 30000) continue;

          const prompt = PROMPTS.tester
            .replace('{FILE_PATH}', filePath)
            .replace('{FILE_CONTENT}', content);

          const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { temperature: 0.2 }
          });

          const reply = response.text?.trim();
          if (reply && reply.includes('NO_TESTS_NEEDED')) {
            await sleep(5000);
            continue;
          }

          let testContent = reply;
          if (testContent.startsWith('```')) {
            testContent = testContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
          }

          await writeFileContent(testFilePath, testContent);
          const testResult = await runTests();
          if (!testResult.success) {
            await fs.unlink(testFilePath).catch(() => {});
            continue;
          }

          const gitResult = await commitAndPush('main', `test: [Zone ${ZONE_ID}] autonomous test for ${path.basename(filePath)}`);
          if (gitResult.success) {
            console.log(`[Zone ${ZONE_ID}] Successfully pushed new test.`);
          }
          await sleep(10000);
          continue;
        }

        // Handle other roles: fixer, optimizer, documenter
        console.log(`[Zone ${ZONE_ID}] [${AGENT_TYPE.toUpperCase()}] Analyzing ${filePath}...`);
        const content = await readFileContent(filePath);
        if (content.length > 30000) continue;

        const prompt = PROMPTS[AGENT_TYPE]
          .replace('{FILE_PATH}', filePath)
          .replace('{FILE_CONTENT}', content);

        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: { temperature: 0.2 }
        });

        const reply = response.text?.trim();

        const skipKeywords = {
          fixer: 'NO_BUGS_FOUND',
          optimizer: 'NO_OPTIMIZATIONS_NEEDED',
          documenter: 'NO_DOCUMENTATION_NEEDED',
          user_agent: 'NO_CHANGES_NEEDED',
          manager_agent: 'NO_CHANGES_NEEDED',
          admin_agent: 'NO_CHANGES_NEEDED',
          owner_agent: 'NO_CHANGES_NEEDED',
          security_agent: 'NO_CHANGES_NEEDED',
          telemetry_agent: 'NO_CHANGES_NEEDED',
          ratelimit_agent: 'NO_CHANGES_NEEDED',
          patch_agent: 'NO_CHANGES_NEEDED',
          gcp_secret_agent: 'NO_CHANGES_NEEDED',
          gcp_logging_agent: 'NO_CHANGES_NEEDED',
          gcp_storage_agent: 'NO_CHANGES_NEEDED',
          gcp_pubsub_agent: 'NO_CHANGES_NEEDED',
          gcp_iam_agent: 'NO_CHANGES_NEEDED',
          vertex_safety_agent: 'NO_CHANGES_NEEDED',
          gcp_health_agent: 'NO_CHANGES_NEEDED',
          gcp_db_agent: 'NO_CHANGES_NEEDED',
          tenant_isolation_agent: 'NO_CHANGES_NEEDED',
          compliance_agent: 'NO_CHANGES_NEEDED',
          prompt_security_agent: 'NO_CHANGES_NEEDED',
          resiliency_agent: 'NO_CHANGES_NEEDED',
          performance_agent: 'NO_CHANGES_NEEDED',
          cache_agent: 'NO_CHANGES_NEEDED',
          billing_audit_agent: 'NO_CHANGES_NEEDED',
          db_tuner_agent: 'NO_CHANGES_NEEDED'
        };

        if (reply && reply.includes(skipKeywords[AGENT_TYPE])) {
          await sleep(5000);
          continue;
        }

        let updatedContent = reply;
        if (updatedContent.startsWith('```')) {
          updatedContent = updatedContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        await writeFileContent(filePath, updatedContent);
        const testResult = await runTests();
        if (!testResult.success) {
          console.warn(`[Zone ${ZONE_ID}] Tests failed. Reverting...`);
          await writeFileContent(filePath, content);
          continue;
        }

        const commitPrefixes = {
          fixer: 'fix',
          optimizer: 'perf',
          documenter: 'docs',
          user_agent: 'feat(user)',
          manager_agent: 'feat(manager)',
          admin_agent: 'feat(admin)',
          owner_agent: 'feat(owner)',
          security_agent: 'sec(security)',
          telemetry_agent: 'telemetry',
          ratelimit_agent: 'perf(ratelimit)',
          patch_agent: 'chore(patch)',
          gcp_secret_agent: 'sec(gcp-secrets)',
          gcp_logging_agent: 'telemetry(gcp-logging)',
          gcp_storage_agent: 'feat(gcp-storage)',
          gcp_pubsub_agent: 'feat(gcp-pubsub)',
          gcp_iam_agent: 'sec(gcp-iam)',
          vertex_safety_agent: 'sec(vertex-safety)',
          gcp_health_agent: 'feat(gcp-health)',
          gcp_db_agent: 'perf(gcp-db)',
          tenant_isolation_agent: 'sec(tenant-isolation)',
          compliance_agent: 'sec(compliance)',
          prompt_security_agent: 'sec(prompt-security)',
          resiliency_agent: 'perf(resiliency)',
          performance_agent: 'perf(code-perf)',
          cache_agent: 'perf(cache)',
          billing_audit_agent: 'feat(billing)',
          db_tuner_agent: 'perf(db-tuner)'
        };
        const gitResult = await commitAndPush('main', `${commitPrefixes[AGENT_TYPE]}: [Zone ${ZONE_ID}] autonomous update to ${path.basename(filePath)}`);
        if (gitResult.success) {
          console.log(`[Zone ${ZONE_ID}] Successfully deployed update.`);
        }

        await sleep(10000);
      }
    } catch (e) {
      console.error(`[Zone ${ZONE_ID}] [${AGENT_TYPE}] Worker Error:`, e);
      await sleep(15000);
    }

    console.log(`[Zone ${ZONE_ID}] [${AGENT_TYPE}] Cycle complete. Waiting 10 minutes...`);
    await sleep(600000); // 10 minutes sleep between full scans
  }
}

runLoop().catch(console.error);
