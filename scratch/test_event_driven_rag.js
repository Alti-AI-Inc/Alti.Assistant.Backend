import { Settings } from 'llamaindex';
import { runIngestionWorkflow } from '../src/app/modules/workflow_automation/llamaindex/indexPipeline.js';
import { runSearchWorkflow } from '../src/app/modules/workflow_automation/llamaindex/searchPipeline.js';
import { BaseLLM, BaseEmbedding } from 'llamaindex';
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';

// Define completely deterministic mock classes for the pipeline
class MockLLM extends BaseLLM {
  get metadata() {
    return {
      model: 'mock-gemini-3.5',
      temperature: 0.1,
      contextWindow: 1000000,
      structuredOutput: true
    };
  }
  async chat({ messages }) {
    console.log('[Mock LLM] Chat request received');
    // If the request is for document profiling:
    const prompt = messages[messages.length - 1].content;
    if (prompt.includes('document profiler') || prompt.includes('combined corpus')) {
      return {
        message: {
          content: JSON.stringify({
            summary: "Alti is an enterprise AI startup specializing in custom workflow orchestration. Founded in 2024 by ex-DeepMind researchers Shohidul Jaman and team. Reported ARR of $12.4 million in 2025.",
            topics: ["workflow orchestration", "agentic productivity", "DeepMind", "real estate", "aviation"]
          }),
          role: 'assistant'
        }
      };
    }
    // If the request is for answer synthesis:
    return {
      message: {
        content: "Based on the provided documents, Alti is an enterprise AI startup specializing in custom workflow orchestration and agentic productivity software. It was founded in January 2024 by ex-Google DeepMind researchers Shohidul Jaman and team. In FY 2025, they reported an ARR of $12.4 million.",
        role: 'assistant'
      }
    };
  }
}

class MockEmbedding extends BaseEmbedding {
  async getTextEmbedding(text) {
    return new Array(768).fill(0.1);
  }
  async getTextEmbeddings(texts) {
    return texts.map(() => new Array(768).fill(0.1));
  }
}

async function main() {
  console.log('🚀 INITIALIZING DETERMINISTIC EVENT-DRIVEN RAG TEST...');

  // Inject mocks into LlamaIndex Settings
  Settings.llm = new MockLLM();
  Settings.embedModel = new MockEmbedding();
  console.log('✓ Injected MockLLM and MockEmbedding into LlamaIndex settings.');

  const userId = 'event_rag_test_user';
  const tempDocPath = path.resolve('event_test_doc.txt');
  const originalName = 'alti_profile_2025.txt';

  try {
    // 1. Create a temporary document
    console.log('\n--- Step 1: Writing Temporary Document ---');
    const testContent = `
Alti is an enterprise AI startup specializing in custom workflow orchestration and agentic productivity software.
Alti was founded in January 2024 by ex-Google DeepMind researchers Shohidul Jaman and team.
In the fiscal year 2025, Alti reported an annual recurring revenue (ARR) of $12.4 million, driven by strong adoption in the real estate and aviation sectors.
The company's primary office is situated in San Francisco, California.
The chief executive officer of Alti is Jane Doe, who leads product strategy and global operations.
`;
    await fsPromises.writeFile(tempDocPath, testContent, 'utf-8');
    console.log(`✓ Temporary document created at: ${tempDocPath}`);

    // 2. Execute Event-Driven Ingestion Workflow
    console.log('\n--- Step 2: Running Event-Driven Ingestion Pipeline ---');
    console.log('Triggering runIngestionWorkflow...');
    const ingestResult = await runIngestionWorkflow(tempDocPath, originalName, userId);
    console.log('✓ Ingestion Workflow Finished!');
    console.log('Ingestion Report:', JSON.stringify(ingestResult, null, 2));

    if (ingestResult.success && ingestResult.docId && ingestResult.documentCount > 0) {
      console.log('✅ Ingestion event flow verified successfully!');
    } else {
      throw new Error('Ingestion returned invalid or unsuccessful payload');
    }

    // 3. Execute Event-Driven Search Workflow
    console.log('\n--- Step 3: Running Event-Driven Search Pipeline ---');
    const query = 'What is Alti and what was their ARR in 2025?';
    console.log(`Triggering runSearchWorkflow with query: "${query}"...`);
    const searchResult = await runSearchWorkflow(query, userId);
    console.log('✓ Search Workflow Finished!');
    console.log('Search Report:', JSON.stringify(searchResult, null, 2));

    if (searchResult.success && searchResult.content && searchResult.sources.length > 0) {
      console.log('✅ Search RAG event flow verified successfully!');
      console.log(`   Response Content: "${searchResult.content.substring(0, 100)}..."`);
      console.log(`   Sources Citation Count: ${searchResult.sources.length}`);
    } else {
      throw new Error('Search returned invalid or unsuccessful payload');
    }

    // 4. Test Semantic Cache HIT
    console.log('\n--- Step 4: Testing Semantic Cache HIT ---');
    console.log('Triggering runSearchWorkflow again with the same query to verify CacheHitEvent...');
    const cacheResult = await runSearchWorkflow(query, userId);
    console.log('✓ Search Workflow Finished (Cache Run)!');
    console.log('Cache Report:', JSON.stringify(cacheResult, null, 2));

    if (cacheResult.success && cacheResult.cacheHit === true) {
      console.log('✅ Semantic Cache HIT event flow verified successfully!');
      console.log(`   Cache Similarity: ${cacheResult.cacheSimilarity}`);
    } else {
      throw new Error('Semantic Cache HIT failed to trigger or register');
    }

    console.log('\n🎉 ALL EVENT-DRIVEN RAG PIPELINE WORKFLOWS VERIFIED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('\n❌ Verification test failed:', error);
  } finally {
    // 5. Cleanup temporary resources
    console.log('\n--- Step 5: Cleaning up resources ---');
    try {
      if (existsSync(tempDocPath)) {
        await fsPromises.unlink(tempDocPath);
        console.log('✓ Cleaned up temporary document file.');
      }
      const persistDir = path.resolve(`storage/ragsystem/${userId}`);
      if (existsSync(persistDir)) {
        await fsPromises.rm(persistDir, { recursive: true, force: true });
        console.log(`✓ Cleaned up temporary user storage: ${persistDir}`);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
  }
}

main().catch(console.error);
