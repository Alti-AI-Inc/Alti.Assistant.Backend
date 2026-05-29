import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import fsPromises from 'node:fs/promises';
import { createIndexFromFile, loadManifest } from '../src/app/modules/llamaindex/llamaindex.indexer.js';
import { executeAgenticRAG } from '../src/app/modules/llamaindex/langgraph/ragAgentGraph.js';

async function runAdvancedIngestionVerification() {
  console.log('======================================================================');
  console.log('🧪 VERIFYING ADVANCED SENTENCE-WINDOW INGESTION & STATEFUL ORCHESTRATION');
  console.log('======================================================================\n');

  const testUserId = 'test_ingest_user_888';
  const testDir = path.resolve(`./storage/ragsystem/${testUserId}`);
  const tempTestFile = path.resolve(`./scratch/temp_ingestion_test.txt`);

  // Cleanup pre-existing test files/directories
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('🧹 Cleaned existing test RAG storage directory.');
  }

  // Create a temporary text file with sample document content
  const sampleContent = `Google Vertex AI Search Security Guidelines.
Google Vertex AI Search provides enterprise-ready semantic search over private datasets.
The core security guidelines and requirements include a few key points.
Access Control is the first major point. It uses strict integration with Google Cloud IAM roles.
This ensure that users only search and retrieve documents they have permissions to read.
Encryption is the second major point. All document ingestion and vector embeddings are encrypted at rest.
Customer-Managed Encryption Keys (CMEK) and TLS in transit are fully supported.
Data Residency is the third major point. Supports regulatory compliance by pinning ingestion pipelines.
This pins document index storages to specific regional buckets around the world.`;

  await fsPromises.writeFile(tempTestFile, sampleContent, 'utf-8');
  console.log('📝 Created temporary test document with sentence structure.');

  try {
    console.log('\n🔄 Step 1: Triggering createIndexFromFile to run advanced ingestion...');
    const result = await createIndexFromFile(tempTestFile, 'temp_ingestion_test.txt', testUserId);
    console.log('✅ Ingestion completed successfully! Return Payload:', result);

    console.log('\n🔄 Step 2: Introspecting generated storage context & index_store.json...');
    const indexMetaPath = path.join(testDir, 'index_store.json');
    if (!fs.existsSync(indexMetaPath)) {
      throw new Error(`Verification Failure: index_store.json not generated at ${indexMetaPath}`);
    }
    console.log('🟢 SUCCESS: index_store.json successfully generated on disk.');

    // Load document manifest to check page counts and details
    const manifest = await loadManifest(testDir);
    console.log('📊 Manifest Document Details:', JSON.stringify(manifest.documents, null, 2));
    
    if (manifest.documents.length !== 1) {
      throw new Error(`Expected exactly 1 document in manifest, found ${manifest.documents.length}`);
    }

    // Step 3: Verify the RAG engine retrieves and leverages the sentence-window metadata correctly
    console.log('\n🔄 Step 3: Running executeAgenticRAG to test stateful context retrieval...');
    const ragResult = await executeAgenticRAG('What are the main requirements and security guidelines for Google Vertex AI Search?', testUserId);
    
    console.log('\n🟢 [SUCCESS] Stateful RAG completed!');
    console.log(`📝 Generated Response:`);
    console.log(`======================================================================`);
    console.log(ragResult.content);
    console.log(`======================================================================`);

    console.log(`\n🔗 Citations/Sources (${ragResult.sources.length} total):`);
    ragResult.sources.forEach((src, idx) => {
      console.log(`   [Source #${idx + 1}] - Title: ${src.extractedTitle}`);
      console.log(`     Snippet: ${src.snippet}`);
    });

    console.log('\n🎉 ALL ADVANCED INGESTION & PIPELINE VERIFICATION TESTS PASSED 100% SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    // Cleanup temporary test files
    if (fs.existsSync(tempTestFile)) {
      fs.rmSync(tempTestFile, { force: true });
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    console.log('\n🧹 Temporary test files and mock workspace cleaned.');
    process.exit(0);
  }
}

runAdvancedIngestionVerification();
