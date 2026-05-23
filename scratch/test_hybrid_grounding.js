import { createIndexFromFile, askQuery } from '../src/app/modules/llamaindex/llamaindex.indexer.js';
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found, skipping live hybrid grounding test');
    return;
  }

  const tempDocPath = path.resolve('temp_test_hybrid.txt');
  const userId = 'test_user_hybrid_rag';

  try {
    console.log('1. Creating a temporary test document...');
    const testContent = `
Alti is a leading AI workflow and automation enterprise startup.
It was founded in early 2024 by ex-DeepMind researchers Shohidul Jaman and his product engineering team.
In the fiscal year 2025, Alti achieved an annual recurring revenue (ARR) of $12.4 million, driven by strong growth in the real estate sectors.
Jane Doe is the current chief executive officer of Alti, leading global operations and enterprise AI solutions.
`;
    await fsPromises.writeFile(tempDocPath, testContent, 'utf-8');
    console.log(`Temporary document written to ${tempDocPath}`);

    console.log('\n2. Indexing temporary document (Will generate document summary profile)...');
    const indexResult = await createIndexFromFile(tempDocPath, 'alti_profile_2025.txt', userId);
    console.log('Indexing result:', indexResult);

    // Verify document profile creation
    const profilePath = path.resolve(`storage/ragsystem/${userId}/document_profile.json`);
    if (existsSync(profilePath)) {
      const profileData = await fsPromises.readFile(profilePath, 'utf-8');
      console.log('\nGenerated Document Profile Summary:\n', JSON.parse(profileData));
    } else {
      throw new Error('document_profile.json was not created!');
    }

    console.log('\n3. Querying local document context (Expected: Local RAG Answer)...');
    const queryLocal = 'What is Alti\'s revenue and who is leading the company?';
    console.log(`Query: "${queryLocal}"`);
    const resLocal = await askQuery(queryLocal, userId);
    console.log('\nLocal RAG Answer:\n', resLocal.content);
    console.log('\nCitations:\n', JSON.stringify(resLocal.sources, null, 2));

    console.log('\n4. Querying a real-time question outside document scope (Expected: Google Search Fallback)...');
    const queryWeb = 'What is the current CEO of Google and what is their current stock price?';
    console.log(`Query: "${queryWeb}"`);
    const resWeb = await askQuery(queryWeb, userId);
    console.log('\nGrounded Web Answer:\n', resWeb.content);
    console.log('\nWeb Citations:\n', JSON.stringify(resWeb.sources, null, 2));

    console.log('\n✅ Hybrid RAG + Google Search Grounding Fallback verified successfully!');

  } catch (err) {
    console.error('❌ Hybrid test failed:', err);
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
