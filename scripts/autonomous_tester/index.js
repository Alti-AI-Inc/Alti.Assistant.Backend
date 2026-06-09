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

const PROMPT_TEMPLATE = `You are an elite automated QA Engineer AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to write comprehensive unit tests using "vitest".
If the file already has excellent test coverage, or if it's a file that shouldn't be tested (like an index export file or config file), reply EXACTLY with: "NO_TESTS_NEEDED".
Otherwise, write a complete, standalone .test.js file that mocks necessary dependencies and tests the core logic.
The output MUST ONLY be the valid test code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAgent() {
  console.log('Starting Autonomous Test Engineer...');
  const modulesPath = path.join(backendPath, 'src/app/modules');
  
  while (true) {
    try {
      const allFiles = await getAllJSFiles(modulesPath);
      // Filter out files that are already test files
      const sourceFiles = allFiles.filter(f => !f.endsWith('.test.js') && !f.endsWith('.spec.js'));
      sourceFiles.sort(() => 0.5 - Math.random());
      
      for (const filePath of sourceFiles) {
        // Check if test file already exists
        const testFilePath = filePath.replace('.js', '.test.js');
        let testExists = true;
        try {
          await fs.access(testFilePath);
        } catch {
          testExists = false;
        }

        if (testExists) {
          continue; // Skip if it already has tests (for now)
        }

        console.log(`Analyzing ${filePath} for missing tests...`);
        const content = await readFileContent(filePath);
        
        if (content.length > 30000) continue;

        const prompt = PROMPT_TEMPLATE
          .replace('{FILE_PATH}', filePath)
          .replace('{FILE_CONTENT}', content);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { temperature: 0.2 }
        });

        const reply = response.text?.trim();

        if (reply && reply.includes('NO_TESTS_NEEDED')) {
          console.log('No tests needed.');
          await sleep(5000);
          continue;
        }

        console.log('Generating tests! Saving test file...');
        let testContent = reply;
        if (testContent.startsWith('```')) {
          testContent = testContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        await writeFileContent(testFilePath, testContent);
        
        console.log('Verifying generated tests...');
        const testResult = await runTests();
        
        if (!testResult.success) {
          console.warn('Generated tests failed! Reverting...');
          await fs.unlink(testFilePath).catch(console.error);
          continue;
        }

        console.log('Tests passed! Committing changes...');
        const relativePath = path.relative(backendPath, testFilePath);
        const commitMsg = `test: autonomous test generation for ${path.basename(filePath)}`;
        
        const gitResult = await commitAndPush('main', commitMsg);
        if (gitResult.success) {
          console.log(`Tests deployed successfully for ${relativePath}`);
        } else {
          console.error('Git push failed:', gitResult.output);
        }

        await sleep(10000);
      }
    } catch (error) {
      console.error('Agent loop encountered an error:', error);
    }
    
    console.log('Waiting 1 hour before next full scan cycle...');
    await sleep(3600000);
  }
}

runAgent().catch(console.error);
