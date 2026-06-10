/**
 * Utility script to generate embeddings for tools in the database.
 * Run this script to backfill embeddings for existing tools.
 *
 * Usage: node embeddings-generator.js
 *
 * NOTE: This script requires authentication with GCP. Ensure you have the correct
 * permissions (e.g., 'Secret Manager Secret Accessor' role) and have authenticated
 * via `gcloud auth application-default login`.
 * It expects secrets named 'GEMINI_SECRET_KEY' and 'DATABASE_URL' in GCP Secret Manager,
 * or as environment variables.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import Tool from '../composio_v2/tools.model.js';

// GCP Secret Manager client and in-memory cache for performance.
const secretManagerClient = new SecretManagerServiceClient();
const secretCache = new Map();

/**
 * Asynchronously retrieves a secret from an environment variable or GCP Secret Manager.
 * It prioritizes environment variables (common in Cloud Run) and uses an in-memory cache
 * for secrets fetched from GCP to reduce API calls.
 * @param {string} secretName - The name of the secret to retrieve (e.g., 'DATABASE_URL').
 * @returns {Promise<string>} A promise that resolves to the secret value.
 * @throws {Error} If the secret cannot be accessed or the GCP project ID is not set.
 */
async function getSecret(secretName) {
  // Prefer environment variables if they exist.
  if (process.env[secretName]) {
    return process.env[secretName];
  }

  // Check cache to avoid repeated GCP API calls.
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }

  // Fetch from GCP Secret Manager.
  const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      'GCP_PROJECT or GOOGLE_CLOUD_PROJECT environment variable must be set.'
    );
  }

  const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

  try {
    const [version] = await secretManagerClient.accessSecretVersion({ name });
    const payload = version.payload.data.toString('utf8');
    secretCache.set(secretName, payload); // Cache the secret for subsequent calls.
    return payload;
  } catch (error) {
    console.error(`Failed to access secret: ${name}`, error);
    throw new Error(
      `Could not access secret: ${secretName}. Ensure it exists in GCP Secret Manager and the service account has the 'Secret Manager Secret Accessor' role.`
    );
  }
}

/**
 * @type {GoogleGenerativeAI} genAI - An instance of GoogleGenerativeAI.
 * It will be initialized dynamically within generateEmbeddingsForTools after fetching the API key.
 */
let genAI;

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
    // Dynamically resolve secrets from environment variables or GCP Secret Manager.
    const databaseUrl = await getSecret('DATABASE_URL');
    const geminiSecretKey = await getSecret('GEMINI_SECRET_KEY');

    // Initialize AI client with the resolved secret key.
    genAI = new GoogleGenerativeAI(geminiSecretKey);

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(databaseUrl);
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
    // Ensure disconnection even if an error occurs after connection.
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
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