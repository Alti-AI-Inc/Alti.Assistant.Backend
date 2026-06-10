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
const MODEL_NAME = 'gemini-3.5-flash'; // Optimized cost model requested by user

console.log(`Starting Swarm Worker - Type: ${AGENT_TYPE.toUpperCase()}, Zone: ${ZONE_ID}, Modules: ${ASSIGNED_MODULES.join(', ')}`);

const PROMPTS = {
  fixer: `You are an elite automated security and bug-fixing AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Identify any bugs, security vulnerabilities (like IDOR, SQLi, unhandled promises), or obvious performance issues.
If you find NO bugs, reply EXACTLY with: "NO_BUGS_FOUND".
If you DO find a bug, provide the ENTIRE updated file content, incorporating the fix. Do NOT provide explanations outside of code comments. The output MUST ONLY be the corrected valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  tester: `You are an elite automated QA Engineer AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to write comprehensive unit tests using "vitest".
If the file already has excellent test coverage, or if it's a file that shouldn't be tested (like an index export file or config file), reply EXACTLY with: "NO_TESTS_NEEDED".
Otherwise, write a complete, standalone .test.js file that mocks necessary dependencies and tests the core logic.
The output MUST ONLY be the valid test code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  optimizer: `You are an elite automated Database & Performance Optimizer AI.
Analyze the following JavaScript file from a Node.js/Express backend that uses Mongoose.
Your task is to identify slow database queries (e.g., missing .lean(), missing indexing recommendations, or N+1 query problems) or CPU-intensive synchronous loops.
If the file is already highly optimized or doesn't interact with the database/heavy compute, reply EXACTLY with: "NO_OPTIMIZATIONS_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the optimizations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`,

  documenter: `You are an elite automated Code Documenter AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to add rich JSDoc comments to all functions, classes, and exported constants.
If the file is a controller or route file, add OpenAPI/Swagger annotations as JSDoc comments above the endpoints.
If the file is already fully and excellently documented, reply EXACTLY with: "NO_DOCUMENTATION_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the new documentation comments. Do NOT modify the core execution logic of the code at all. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

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
          documenter: 'NO_DOCUMENTATION_NEEDED'
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
          documenter: 'docs'
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
