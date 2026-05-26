import dotenv from 'dotenv';
dotenv.config();

import { executeAgenticRAG } from '../src/app/modules/llamaindex/langgraph/ragAgentGraph.js';
import { logger } from '../src/shared/logger.js';
import { queryIngestionStatus } from '../src/app/modules/llamaindex/llamaindex.controller.js';

// Configure logger to display immediately in console
logger.level = 'info';

const testQueries = [
  {
    name: '1. Conversational Query (Friendly Chat)',
    query: 'Hello there! Who are you and how can you help me today?',
  },
  {
    name: '2. Time-Sensitive/Real-time Query (Search Grounding Fallback)',
    query: 'What is Apple\'s current stock price today, and what is their latest product announcement?',
  },
  {
    name: '3. Factual Query (RAG Retrieval with Page-Level Citation Anchors)',
    query: 'What are the main requirements and security guidelines for using Google Vertex AI Search?',
  },
  {
    name: '4. Summarization Query (Parallel Map-Reduce Document Summary Pipeline)',
    query: 'Summarize the entire document and extract the key findings.',
  }
];

async function runVerification() {
  console.log('\n======================================================================');
  console.log('🧪 VERIFYING COGNITIVE RAG SYSTEM COGNITIVE ITERATIONS END-TO-END');
  console.log('======================================================================\n');

  const userId = 'verify_test_user_99';

  // Test Case 1-4: Stateful LangGraph RAG Loop
  for (const testCase of testQueries) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`🏃 Running Test Case: ${testCase.name}`);
    console.log(`   User Query: "${testCase.query}"`);
    console.log(`----------------------------------------------------------------------`);

    const start = Date.now();
    try {
      const response = await executeAgenticRAG(testCase.query, userId);
      const duration = Date.now() - start;

      console.log(`\n🟢 [SUCCESS] Completed in ${duration}ms`);
      console.log(`📝 Generated Response:`);
      console.log(`======================================================================`);
      console.log(response.content);
      console.log(`======================================================================`);
      
      console.log(`\n🔗 Citations/Sources (${response.sources.length} total):`);
      response.sources.forEach((src, idx) => {
        console.log(`   [Source #${idx + 1}] - Title: ${src.extractedTitle || 'N/A'}`);
        console.log(`     URL: ${src.url}`);
        console.log(`     Page Number: ${src.pageNumber || 'N/A'}`);
        console.log(`     Snippet: ${src.snippet.substring(0, 150)}...`);
      });

      console.log(`\n🔍 Extra Metadata:`);
      console.log(`   - Web Search Grounding Active: ${response.webSearchUsed}`);
      
    } catch (error) {
      console.error(`\n❌ [ERROR] Test Case failed:`, error);
    }
  }

  // Test Case 5: Temporal Ingestion Status Express Controller Mock
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`🏃 Running Test Case: 5. Temporal Ingestion status API Progress tracking`);
  console.log(`   Simulating request to GET /documents/ingest/status/verify_workflow_99`);
  console.log(`----------------------------------------------------------------------`);
  
  const mockReq = {
    params: { workflowId: 'verify_workflow_99' }
  };
  
  const mockRes = {
    statusCode: 200,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(payload) {
      console.log(`\n🟢 [SUCCESS] Controller returned status ${this.statusCode}`);
      console.log(`📊 JSON Response Payload:`);
      console.log(JSON.stringify(payload, null, 2));
    }
  };

  try {
    await queryIngestionStatus(mockReq, mockRes);
  } catch (error) {
    console.error(`\n❌ [ERROR] status API test failed:`, error);
  }

  console.log('\n======================================================================');
  console.log('✅ ALL RAG COGNITIVE ITERATIONS VERIFICATION COMPLETED');
  console.log('======================================================================\n');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('Critical verification script error:', err);
  process.exit(1);
});
