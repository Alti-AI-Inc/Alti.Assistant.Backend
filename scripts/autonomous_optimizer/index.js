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

const PROMPT_TEMPLATE = `You are an elite automated Database & Performance Optimizer AI.
Analyze the following JavaScript file from a Node.js/Express backend that uses Mongoose.
Your task is to identify slow database queries (e.g., missing .lean(), missing indexing recommendations, or N+1 query problems) or CPU-intensive synchronous loops.
If the file is already highly optimized or doesn't interact with the database/heavy compute, reply EXACTLY with: "NO_OPTIMIZATIONS_NEEDED".
Otherwise, provide the ENTIRE updated file content, incorporating the optimizations. Do NOT provide explanations outside of code comments. The output MUST ONLY be the valid code, no markdown blocks, no formatting around it. Just raw code.

File Path: {FILE_PATH}
Content:
{FILE_CONTENT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAgent() {
  console.log('Starting Autonomous Performance Optimizer...');
  const modulesPath = path.join(backendPath, 'src/app/modules');
  
  while (true) {
    try {
      const allFiles = await getAllJSFiles(modulesPath);
      // Mostly focus on services and controllers for optimizations
      const sourceFiles = allFiles.filter(f => f.includes('.service.js') || f.includes('.controller.js'));
      sourceFiles.sort(() => 0.5 - Math.random());
      
      for (const filePath of sourceFiles) {
        console.log(`Analyzing ${filePath} for optimizations...`);
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

        if (reply && reply.includes('NO_OPTIMIZATIONS_NEEDED')) {
          console.log('No optimizations needed.');
          await sleep(5000);
          continue;
        }

        console.log('Optimizations found! Applying...');
        let fixedContent = reply;
        if (fixedContent.startsWith('```')) {
          fixedContent = fixedContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        await writeFileContent(filePath, fixedContent);
        
        console.log('Verifying optimizations with tests...');
        const testResult = await runTests();
        
        if (!testResult.success) {
          console.warn('Optimizations failed tests! Reverting...');
          await writeFileContent(filePath, content);
          continue;
        }

        console.log('Tests passed! Committing changes...');
        const relativePath = path.relative(backendPath, filePath);
        const commitMsg = `perf: autonomous optimization of ${path.basename(filePath)}`;
        
        const gitResult = await commitAndPush('main', commitMsg);
        if (gitResult.success) {
          console.log(`Optimization deployed successfully for ${relativePath}`);
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
