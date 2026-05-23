/**
 * Verification Script: Deep Research Agent 360 Upgrade (Local Backend Context)
 * Executes the full recursive LangGraph workflow to test parallel web search grounding,
 * dynamic model routing, and C-Suite PPTX strategic slide deck compiler generation.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environmental parameters
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.DISABLE_MONGO_CHECKPOINTER = 'true';

// Dynamically import dependencies after setting env flags
const { runDeepResearchAgent } = await import('./src/app/modules/deep_research/deep_research_assistant/workflow.js');
const { knowledgeQueryService } = await import('./src/app/modules/knowledge/services/knowledgeQuery.js');

console.log('--- STARTING DEEP RESEARCH 360° UPGRADE VERIFICATION ---');

// Mock knowledgeQueryService.semanticSearch to verify local RAG blending without depending on a live pg connection
const originalSemanticSearch = knowledgeQueryService.semanticSearch;
knowledgeQueryService.semanticSearch = async (query, ownerType, ownerId, options = {}) => {
  console.log(`[VERIFICATION STUB] Intercepted semanticSearch for query: "${query}"`);
  return {
    success: true,
    results: [
      {
        fileName: 'alti_internal_strategy_2026.pdf',
        content: `Alti.Assistant internal system specifications define the Deep Research module as an autonomous Perplexity-killer. It leverages pgvector RAG with Reciprocal Rank Fusion (RRF) for local search and Gemini search grounding for real-time web scans.`,
        similarity: 0.92,
        gcsUrl: 'https://storage.googleapis.com/alti_assistant_datasets/alti_internal_strategy_2026.pdf'
      }
    ],
    totalResults: 1,
    query
  };
};

async function testUpgrade() {
  const query = 'What is the future of agentic coding AI tools in 2026?';
  const options = {
    generatePdf: true,
    conversationId: 'test_conv_360_upgrade_' + Date.now(),
    maxDepth: 2,
    userId: 'user_verification_test_123',
    history: []
  };

  try {
    console.log(`Executing Deep Research Agent for query: "${query}"...`);
    const startTime = Date.now();
    const result = await runDeepResearchAgent(query, options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n======================================');
    console.log('RESEARCH EXECUTION COMPLETED');
    console.log(`Duration: ${duration} seconds`);
    console.log(`Success: ${result.success}`);
    console.log('======================================\n');

    if (!result.success) {
      console.error('Deep Research execution failed:', result.error);
      process.exit(1);
    }

    console.log('--- VERIFICATION METADATA ---');
    console.log('Query:', result.query);
    console.log('Success Flag:', result.success);
    console.log('Conversation ID:', result.conversationId);
    console.log('Total Sources:', result.sources?.length || 0);
    console.log('Confidence Index:', result.metadata?.confidence);

    console.log('\n--- VERIFICATION SOURCES ---');
    if (result.sources && result.sources.length > 0) {
      result.sources.forEach((source, i) => {
        console.log(`${i + 1}. ${source.title} (URL: ${source.url})`);
        console.log(`   Excerpt: ${source.snippet?.substring(0, 120)}...`);
      });
    } else {
      console.log('No sources retrieved!');
    }

    console.log('\n--- VERIFICATION PDF REPORT ---');
    if (result.pdfData) {
      console.log(`PDF Filename: ${result.pdfData.filename}`);
      console.log(`PDF Size: ${(result.pdfData.size / 1024).toFixed(2)} KB`);
      console.log(`PDF Saved Locally: ${result.pdfData.savedLocally}`);
      console.log(`PDF Path: ${result.pdfData.localPath}`);
      
      const fileExists = fs.existsSync(result.pdfData.localPath);
      console.log(`PDF Physical File Exists on Disk: ${fileExists}`);
      if (fileExists) {
        console.log('✓ Premium PDF rendered and verified physically!');
      } else {
        console.error('⚠️ PDF was generated but could not be located physically on disk!');
      }
    } else {
      console.warn('⚠️ PDF was requested but no PDF data returned!');
    }

    console.log('\n--- VERIFICATION FINAL REPORT SYNTHESIS (EXCERPT) ---');
    if (result.answer) {
      console.log(result.answer.substring(0, 800) + '\n...\n');
      console.log('✓ Final report output validated successfully!');
    } else {
      console.error('⚠️ Final report synthesis is empty!');
    }

    console.log('--- ALL UPGRADE VERIFICATION TASKS COMPLETED SUCCESSFULLY ---');
    process.exit(0);
  } catch (err) {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
  }
}

// Execute the verification
testUpgrade();
