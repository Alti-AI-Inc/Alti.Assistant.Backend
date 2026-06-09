import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readFileContent, writeFileContent, getAllJSFiles } from './fileManager.js';
import { runTests } from './verifier.js';
import { commitAndPush } from './gitManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendPath = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(backendPath, '.env') });

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_SECRET_KEY });

const PROMPT_TEMPLATE = `You are an elite automated security and bug-fixing AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Identify any bugs, security vulnerabilities (like IDOR, SQLi, unhandled promises), or obvious performance issues.
If you find NO bugs, reply EXACTLY with: "NO_BUGS_FOUND".
If you DO find a bug, provide the ENTIRE updated file content, incorporating the fix. Do NOT provide explanations outside of code comments. The output MUST ONLY be the corrected valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`;

/**
 * Sleeps for a given duration.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Agent's main loop.
 */
async function runAgent() {
  console.log('Starting Autonomous Agent...');
  
  // Example: target specific modules to avoid analyzing the whole codebase at once
  const modulesPath = path.join(backendPath, 'src/app/modules');
  
  while (true) {
    try {
      console.log('Scanning for files...');
      const allFiles = await getAllJSFiles(modulesPath);
      
      // Shuffle files to pick random ones
      allFiles.sort(() => 0.5 - Math.random());
      
      for (const filePath of allFiles) {
        console.log(`Analyzing ${filePath}...`);
        const content = await readFileContent(filePath);
        
        // Skip large files to save tokens
        if (content.length > 30000) {
          console.log('File too large, skipping.');
          continue;
        }

        const prompt = PROMPT_TEMPLATE
          .replace('{FILE_PATH}', filePath)
          .replace('{FILE_CONTENT}', content);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            temperature: 0.2
          }
        });

        const reply = response.text?.trim();

        if (reply && reply.includes('NO_BUGS_FOUND')) {
          console.log('No bugs found.');
          // Sleep a bit to respect rate limits
          await sleep(5000);
          continue;
        }

        console.log('Bug found! Applying fix...');
        
        // Clean up markdown block if the model included it despite instructions
        let fixedContent = reply;
        if (fixedContent.startsWith('```')) {
          fixedContent = fixedContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        // Apply fix
        await writeFileContent(filePath, fixedContent);
        
        // Verify via tests
        console.log('Verifying fix with tests...');
        const testResult = await runTests();
        
        if (!testResult.success) {
          console.warn('Tests failed after fix. Reverting...');
          await writeFileContent(filePath, content);
          continue;
        }

        console.log('Tests passed! Committing changes...');
        const relativePath = path.relative(backendPath, filePath);
        const commitMsg = `fix: autonomous repair of ${relativePath}`;
        
        const gitResult = await commitAndPush('main', commitMsg);
        if (gitResult.success) {
          console.log(`Fix deployed successfully for ${relativePath}`);
        } else {
          console.error('Git push failed:', gitResult.output);
        }

        // Wait before next action to avoid being overly aggressive
        await sleep(10000);
      }
    } catch (error) {
      console.error('Agent loop encountered an error:', error);
    }
    
    // Global wait before full rescan
    console.log('Waiting 1 hour before next full scan cycle...');
    await sleep(3600000);
  }
}

// Start the agent
runAgent().catch(console.error);
