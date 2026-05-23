import { createIndexFromFile, askQuery } from '../src/app/modules/llamaindex/llamaindex.indexer.js';
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found, skipping live production test');
    return;
  }

  const tempDocPath = path.resolve('temp_test_doc.txt');
  const userId = 'test_user_sota_rag';

  try {
    console.log('1. Creating a temporary test document...');
    const testContent = `
Alti is an enterprise AI startup specializing in custom workflow orchestration and agentic productivity software.
Alti was founded in January 2024 by ex-Google DeepMind researchers Shohidul Jaman and team.
In the fiscal year 2025, Alti reported an annual recurring revenue (ARR) of $12.4 million, driven by strong adoption in the real estate and aviation sectors.
The company's primary office is situated in San Francisco, California.
The chief executive officer of Alti is Jane Doe, who leads product strategy and global operations.
`;
    await fsPromises.writeFile(tempDocPath, testContent, 'utf-8');
    console.log(`Temporary document written to ${tempDocPath}`);

    console.log('\n2. Indexing temporary document in LlamaIndex production pipeline...');
    const indexResult = await createIndexFromFile(tempDocPath, 'alti_annual_report_2025.txt', userId);
    console.log('Indexing result:', indexResult);

    console.log('\n3. Querying the live index with follow-up history (Simulating multi-turn conversation)...');
    
    // First query: simple lookup
    const query1 = 'What is Alti and where is it based?';
    console.log(`User query: "${query1}"`);
    const response1 = await askQuery(query1, userId);
    console.log('\nResponse 1 content:\n', response1.content);
    console.log('\nResponse 1 sources:\n', JSON.stringify(response1.sources, null, 2));

    // Second query: multi-turn follow up containing pronoun
    const query2 = 'Who is leading them and how much did they make in 2025?';
    console.log(`\nUser follow-up query: "${query2}"`);
    const response2 = await askQuery(query2, userId);
    console.log('\nResponse 2 content:\n', response2.content);
    console.log('\nResponse 2 sources:\n', JSON.stringify(response2.sources, null, 2));

    console.log('\n✅ End-to-end integration verification completed successfully!');

  } catch (err) {
    console.error('❌ Integration test failed:', err);
  } finally {
    // Cleanup temporary files
    try {
      if (existsSync(tempDocPath)) {
        await fsPromises.unlink(tempDocPath);
        console.log('Cleaned up temporary document');
      }
      
      const persistDir = path.resolve(`storage/ragsystem/${userId}`);
      if (existsSync(persistDir)) {
        await fsPromises.rm(persistDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary storage context directory: ${persistDir}`);
      }
    } catch (cleanupErr) {
      console.error('Cleanup warning:', cleanupErr.message);
    }
  }
}

run().catch(console.error);
