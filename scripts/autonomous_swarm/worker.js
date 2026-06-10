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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_SECRET_KEY });

// Get configuration from environment variables
const AGENT_TYPE = process.env.AGENT_TYPE || 'fixer'; // fixer, tester, optimizer, documenter
const ZONE_ID = process.env.ZONE_ID || '1';
const ASSIGNED_MODULES = JSON.parse(process.env.ASSIGNED_MODULES || '[]');
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-pro'; // Upgrade to Pro model to leverage user's Ultra subscription plan

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
          patch_agent: 'NO_CHANGES_NEEDED'
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
          patch_agent: 'chore(patch)'
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
