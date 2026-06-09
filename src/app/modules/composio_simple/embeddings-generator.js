/**
 * Utility script to generate embeddings for tools in the database.
 * Run this script to backfill embeddings for existing tools.
 *
 * Usage: node embeddings-generator.js
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';
import Tool from '../composio_v2/tools.model.js';
import config from '../../../../config/index.js';

/**
 * @constant {GoogleGenerativeAI} genAI - An instance of GoogleGenerativeAI initialized with the API key.
 * Used to interact with Google's Generative AI models, specifically for embedding generation.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a vector embedding for a given text string using the Gemini `text-embedding-004` model.
 *
 * @async
 * @param {string} text - The input text for which to generate an embedding.
 * @returns {Promise<number[]|null>} A promise that resolves to an array of numbers representing the embedding vector,
 *                                   or `null` if an error occurs during embedding generation.
 */
async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Connects to MongoDB, finds tools that do not have embeddings, generates embeddings for them
 * using the `generateEmbedding` function, and updates the tools in the database.
 * It processes tools in batches and includes rate limiting.
 *
 * After processing, it provides a summary and instructions for creating a MongoDB Atlas
 * vector search index.
 *
 * @async
 * @returns {Promise<void>} A promise that resolves when all eligible tools have been processed
 *                          or an error occurs.
 */
async function generateEmbeddingsForTools() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.database_url);
    console.log('✅ Connected to MongoDB');

    // Find tools without embeddings
    const toolsWithoutEmbeddings = await Tool.find({
      $or: [
        { embedding: { $exists: false } },
        { embedding: null },
        { embedding: [] },
      ],
    }).limit(100); // Process in batches

    console.log(
      `\n📊 Found ${toolsWithoutEmbeddings.length} tools without embeddings`
    );

    if (toolsWithoutEmbeddings.length === 0) {
      console.log('✅ All tools already have embeddings!');
      await mongoose.disconnect();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < toolsWithoutEmbeddings.length; i++) {
      const tool = toolsWithoutEmbeddings[i];

      // Create embedding text from tool name and description
      const embeddingText = `${tool.name} - ${tool.description || ''}`;

      console.log(
        `\n[${i + 1}/${toolsWithoutEmbeddings.length}] Processing: ${tool.name}`
      );
      console.log(`  App: ${tool.appName || tool.slug || 'unknown'}`);

      // Generate embedding
      const embedding = await generateEmbedding(embeddingText);

      if (embedding && embedding.length > 0) {
        // Update tool with embedding
        await Tool.updateOne(
          { _id: tool._id },
          {
            $set: {
              embedding: embedding,
              appName: tool.appName || tool.slug, // Ensure appName is set
            },
          }
        );

        console.log(
          `  ✅ Generated embedding (${embedding.length} dimensions)`
        );
        successCount++;

        // Rate limiting - wait a bit between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        console.log(`  ❌ Failed to generate embedding`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY:');
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📝 Total processed: ${successCount + errorCount}`);
    console.log('='.repeat(50));

    console.log('\n💡 Next steps:');
    console.log('1. Create vector search index in MongoDB Atlas:');
    console.log('   - Go to Atlas UI → Database → Search Indexes');
    console.log('   - Create Search Index with type "vectorSearch"');
    console.log('   - Use the following JSON definition:');
    console.log(`
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "appName"
    }
  ]
}
    `);
    console.log('2. Name the index: "vector_index"');
    console.log('3. Test the vector search with your API');

    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
console.log('🚀 Starting embeddings generation...\n');
/**
 * Initiates the process of generating embeddings for tools.
 * This is the main entry point for the script's execution.
 */
generateEmbeddingsForTools();