/**
 * Test script for vector search functionality
 * Tests embedding generation and vector search
 *
 * Usage: node test-vector-search.js
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';
import Tool from '../composio_v2/tools.model.js';
import config from '../../../../config/index.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generate embedding for text
 */
async function embedQuery(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Test vector search with sample queries
 */
async function testVectorSearch() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.database_url);
    console.log('✅ Connected to MongoDB\n');

    const testQueries = [
      {
        query: 'send an email to mr Michael about the meeting tomorrow',
        app: 'gmail',
      },
      { query: 'list all branches in my repository', app: 'github' },
      { query: 'create a new issue on GitHub', app: 'github' },
      { query: 'get my calendar events for today', app: null }, // Test without app filter
    ];

    for (const test of testQueries) {
      console.log('='.repeat(60));
      console.log(`🔍 Query: "${test.query}"`);
      if (test.app) {
        console.log(`📱 App filter: ${test.app}`);
      }
      console.log('');

      // Generate embedding
      const vector = await embedQuery(test.query);
      console.log(`✅ Generated embedding (${vector.length} dimensions)`);

      // Build aggregation pipeline
      const pipeline = [
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: vector,
            numCandidates: 200,
            limit: 5,
          },
        },
        {
          $project: {
            name: 1,
            description: 1,
            appName: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];

      // Add app filter if specified
      if (test.app) {
        pipeline[0].$vectorSearch.filter = { appName: test.app };
      }

      try {
        const results = await Tool.aggregate(pipeline);

        console.log(`\n📊 Found ${results.length} results:\n`);

        results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.name}`);
          console.log(`   App: ${result.appName || 'unknown'}`);
          console.log(`   Score: ${result.score?.toFixed(4)}`);
          console.log(
            `   Description: ${result.description?.substring(0, 80)}...`
          );
          console.log('');
        });
      } catch (searchError) {
        console.error('❌ Vector search failed:', searchError.message);
        console.log(
          '\n💡 Make sure you have created the vector_index in MongoDB Atlas!'
        );
        console.log('   See embeddings-generator.js for instructions.');
      }

      console.log('');
    }

    console.log('='.repeat(60));
    console.log('✅ Test completed!');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting vector search test...\n');
testVectorSearch();
