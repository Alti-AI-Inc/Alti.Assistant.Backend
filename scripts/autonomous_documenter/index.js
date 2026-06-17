import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readFileContent, writeFileContent, getAllJSFiles } from '../autonomous_agent/fileManager.js';
import { runTests } from '../autonomous_agent/verifier.js';
import { commitAndPush } from '../autonomous_agent/gitManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendPath = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(backendPath, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_SECRET_KEY });

const PROMPT_TEMPLATE = `You are an elite automated Code Documenter AI.
Analyze the following JavaScript file from a Node.js/Express backend.
Your task is to add rich JSDoc comments to all functions, classes, and exported constants.
If the file is a controller or route file, add OpenAPI/Swagger annotations as JSDoc comments above the endpoints.
If the file is already fully and excellently documented, reply EXACTLY with: "NO_DOCUMENTATION_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the new documentation comments. Do NOT modify the core execution logic of the code at all. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAgent() {
  console.log('Starting Autonomous Code Documenter...');
  const modulesPath = path.join(backendPath, 'src/app/modules');
  
  while (true) {
    try {
      const allFiles = await getAllJSFiles(modulesPath);
      allFiles.sort(() => 0.5 - Math.random());
      
      for (const filePath of allFiles) {
        if (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js')) continue;

        console.log(`Analyzing ${filePath} for missing documentation...`);
        const content = await readFileContent(filePath);
        
        if (content.length > 30000) continue;

        const prompt = PROMPT_TEMPLATE
          .replace('{FILE_PATH}', filePath)
          .replace('{FILE_CONTENT}', content);

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: { temperature: 0.2 }
        });

        const reply = response.text?.trim();

        if (reply && reply.includes('NO_DOCUMENTATION_NEEDED')) {
          console.log('No documentation needed.');
          await sleep(5000);
          continue;
        }

        console.log('Missing docs found! Applying...');
        let fixedContent = reply;
        if (fixedContent.startsWith('```')) {
          fixedContent = fixedContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        await writeFileContent(filePath, fixedContent);
        
        console.log('Verifying documented file does not break tests...');
        const testResult = await runTests();
        
        if (!testResult.success) {
          console.warn('Documentation broke tests (syntax error?)! Reverting...');
          await writeFileContent(filePath, content);
          continue;
        }

        console.log('Tests passed! Committing changes...');
        const relativePath = path.relative(backendPath, filePath);
        const commitMsg = `docs: autonomous documentation for ${path.basename(filePath)}`;
        
        const gitResult = await commitAndPush('main', commitMsg);
        if (gitResult.success) {
          console.log(`Documentation deployed successfully for ${relativePath}`);
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
