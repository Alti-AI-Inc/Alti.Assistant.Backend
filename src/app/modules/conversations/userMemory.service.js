/**
 * @file This service manages user-specific long-term memory, including fact extraction, storage, and retrieval.
 * It leverages a Generative AI model to process conversation turns and update a user's persistent profile.
 * @module modules/conversations/userMemory.service
 */

import UserMemory from './userMemory.model.js';
// AUDIT: Replaced '@google/generative-ai' with '@google-cloud/vertexai' to use Application Default Credentials (ADC).
import { VertexAI } from '@google-cloud/vertexai';
import sanitizeHtml from 'sanitize-html'; // Security Patch: Import library to sanitize input and prevent Stored XSS.
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// AUDIT: Removed global client initialization with an API key.
// The Vertex AI client will be initialized within the function that uses it,
// relying on Application Default Credentials for authentication.

/**
 * The system instruction prompt used for the Generative AI model to extract, update,
 * refine, or delete long-term personal facts, attributes, or preferences from a conversation turn.
 * It defines strict rules for context-aware aggregation, redundancy prevention, conflict resolution,
 * redaction, and stable context capture, along with a specific JSON output schema.
 * @constant {string} FACT_EXTRACTION_PROMPT
 */
const FACT_EXTRACTION_PROMPT = `You are a cognitive memory manager for a state-of-the-art AI Assistant.
Your job is to analyze the conversation turn in the context of the user's EXISTING USER PROFILE & MEMORIES, and extract, update, refine, or delete long-term personal facts, attributes, or preferences.

Rules:
1. Context-Aware Aggregation: Compare new facts against the provided EXISTING USER PROFILE & MEMORIES.
2. Prevent Redundancy: If a fact is already perfectly and accurately recorded, do NOT output it (avoid database noise).
3. Conflict Resolution & Refinement: If the new turn contradicts or refines an existing fact (e.g., user changed location, startup name, or tech preference), output the consolidated new value using the EXACT same key name.
4. Redaction/Deletion: If the user explicitly corrections or disavows an existing memory (e.g. "I no longer work with Django", "Forget that I live in Berlin"), output the key with "action": "delete".
5. Stable Context Only: Do NOT capture fleeting topics, questions, or one-off tasks. Capture only things that remain true about the user across multiple sessions (profession, tech stacks, writing tone, location, companies, hobbies, preferred styles).
6. Keys must be lowercase, normalized, using underscores (e.g. "tech_stack", "profession", "location", "writing_style", "company", "hobbies").

You MUST respond strictly with a valid JSON array of objects, where each object matches this schema:
{
  "key": "string (normalized key name)",
  "value": "string (consolidated fact/preference value, or empty if action is delete)",
  "category": "string ('facts' or 'preferences')",
  "action": "string (must be 'upsert' or 'delete')"
}
If no updates, new facts, or deletions are required, respond with exactly an empty array: [].
Do NOT wrap the JSON in markdown blocks. Return pure raw JSON string.`;

/**
 * Retrieves all persistent memories for a given user and compiles them into a structured
 * markdown block suitable for grounding an LLM's responses.
 *
 * @param {string} userId - The unique identifier of the user whose memories are to be retrieved.
 * @returns {Promise<string>} A promise that resolves to a formatted markdown string containing
 *   the user's profile and persistent memories, or an empty string if no memories are found
 *   or an error occurs.
 */
const getProfileBlock = async (userId) => {
  // Security: The userId is passed to Mongoose, which provides protection against NoSQL injection.
  if (!userId) return '';
  try {
    // Optimization: Added .lean() for read-only operations to improve performance by returning plain JavaScript objects.
    // Indexing Recommendation: Consider adding a compound index on `{ userId: 1, key: 1 }` to the UserMemory model
    // for efficient lookups, updates, and deletions.
    const memories = await UserMemory.find({ userId }).lean();
    if (!memories || memories.length === 0) return '';

    logger.info(`[UserMemory] Compiling profile grounding block for user ${userId} with ${memories.length} facts.`);
    
    let block = `\n=== USER PROFILE & PERSISTENT MEMORY ===\n`;
    block += `The following are verified facts and preferences about this user, learned from past conversations. Formulate your responses to naturally align with and incorporate this context:\n`;
    
    memories.forEach((mem) => {
      // Normalize key for presentation (e.g., "tech_stack" -> "Tech Stack")
      const prettyKey = mem.key
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Note: The 'mem.value' is now sanitized on write, protecting against Stored XSS if this block were ever rendered as HTML.
      block += `- ${prettyKey}: ${mem.value}\n`;
    });
    
    block += `========================================\n\n`;
    return block;
  } catch (err) {
    logger.error(`[UserMemory] Failed to compile profile block for user ${userId}:`, err);
    return '';
  }
};

/**
 * Asynchronously extracts new facts and preferences from a conversation turn (user prompt and assistant reply),
 * resolves conflicts with existing memories, and consolidates them in the database.
 * This function is designed to run in the background to avoid blocking the main execution thread.
 *
 * It performs the following steps:
 * 1. Fetches existing user memories to provide context for the AI model.
 * 2. Constructs a detailed prompt for the Generative AI model, including existing memories and the new conversation turn.
 * 3. Calls the Generative AI model (Gemini) to extract structured facts/directives (upsert or delete).
 * 4. Parses the AI's JSON response.
 * 5. Iterates through the extracted directives and performs corresponding database operations (upsert or delete)
 *    for each memory fact.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} prompt - The user's input prompt in the conversation turn.
 * @param {string} reply - The AI assistant's reply in the conversation turn.
 * @returns {void} This function does not return a value directly, as it operates asynchronously
 *   and handles its own errors internally.
 */
const asyncExtractFacts = async (userId, prompt, reply) => {
  // Security: The userId is passed to Mongoose, which provides protection against NoSQL injection.
  if (!userId || !prompt || !reply) return;

  // Run in background wrap with try-catch to protect the core execution thread
  setTimeout(async () => {
    try {
      logger.info(`[UserMemory] Background fact extraction and consolidation triggered for user ${userId}`);
      
      // 1. Fetch existing memories to allow cognitive conflict resolution and prevent duplicate writes
      // Optimization: Added .lean() for read-only operations to improve performance by returning plain JavaScript objects.
      // Indexing Recommendation: Consider adding a compound index on `{ userId: 1, key: 1 }` to the UserMemory model
      // for efficient lookups, updates, and deletions.
      const existingMemories = await UserMemory.find({ userId }).lean();
      let existingSummary = 'None';
      if (existingMemories && existingMemories.length > 0) {
        existingSummary = existingMemories
          .map((m) => `- key: "${m.key}", value: "${m.value}", category: "${m.category}"`)
          .join('\n');
      }

      const turnText = `EXISTING USER PROFILE & MEMORIES:\n${existingSummary}\n\nNEW CONVERSATION TURN:\nUSER PROMPT:\n"${prompt}"\n\nASSISTANT REPLY:\n"${reply}"`;
      let rawJson = '[]';

      try {
        // AUDIT: Initialize the Vertex AI client using Application Default Credentials (ADC).
        // This removes the need for hardcoded API keys. The service account running this
        // code must have the "Vertex AI User" IAM role in the target GCP project.
        const vertexAI = new VertexAI({
          project: config.gcp_project_id,
          location: config.gcp_location,
        });

        // AUDIT: Switched to a valid Vertex AI model name.
        const model = vertexAI.getGenerativeModel({
          model: 'gemini-1.5-flash-001',
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: turnText }] }],
          systemInstruction: { role: "system", parts: [{ text: FACT_EXTRACTION_PROMPT }] }
        });

        rawJson = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      } catch (geminiErr) {
        logger.error(`[UserMemory] Gemini fact extraction failed: ${geminiErr.message}`);
        return;
      }

      // Clean markdown code blocks just in case
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      let extractedFacts = [];
      try {
        extractedFacts = JSON.parse(rawJson);
      } catch (e) {
        logger.error('[UserMemory] Failed to parse extracted facts JSON:', e);
        return;
      }

      if (!Array.isArray(extractedFacts) || extractedFacts.length === 0) {
        logger.info('[UserMemory] No updates, deletions, or new facts detected in this turn.');
        return;
      }

      logger.info(`[UserMemory] Extracted ${extractedFacts.length} cognitive memory directives for user ${userId}.`);

      // Optimization: Batch delete and upsert operations to avoid N+1 queries.
      const deleteKeys = [];
      const bulkUpsertOperations = [];

      for (const fact of extractedFacts) {
        if (!fact.key) continue;
        
        const normalizedKey = fact.key.toLowerCase().trim();
        const action = fact.action === 'delete' ? 'delete' : 'upsert';

        if (action === 'delete') {
          deleteKeys.push(normalizedKey);
        } else {
          if (!fact.value) continue;
          // Security Patch: Sanitize the 'value' field extracted by the AI before storing it.
          // This prevents Stored Cross-Site Scripting (XSS) by stripping all HTML tags.
          // If this data were ever to be rendered on a client-side application, this measure
          // ensures no malicious scripts can be executed.
          const cleanValue = sanitizeHtml(fact.value, {
            allowedTags: [],
            allowedAttributes: {},
          }).trim();
          const category = ['facts', 'preferences', 'settings'].includes(fact.category) ? fact.category : 'facts';

          bulkUpsertOperations.push({
            updateOne: {
              filter: { userId, key: normalizedKey },
              update: {
                $set: {
                  value: cleanValue,
                  category,
                  confidence: fact.confidence || 1.0,
                },
              },
              upsert: true,
              // Note: `runValidators: true` is not directly supported for `updateOne` operations within `bulkWrite`.
              // Validators will run for newly inserted documents (when `upsert: true` creates a new document),
              // but not for updates to existing documents. If strict validation on every update is critical,
              // individual `findOneAndUpdate` calls would be necessary, which reintroduces the N+1 problem.
              // For this use case, schema-level validation on insert/upsert is generally sufficient.
            },
          });
        }
      }

      // Execute batched deletions
      if (deleteKeys.length > 0) {
        try {
          // Security: The 'userId' and 'deleteKeys' are used as values in the query,
          // which is safe from NoSQL injection due to Mongoose/MongoDB driver behavior.
          const result = await UserMemory.deleteMany({ userId, key: { $in: deleteKeys } });
          logger.info(`[UserMemory] Successfully redacted ${result.deletedCount} memory keys.`);
        } catch (delErr) {
          logger.error(`[UserMemory] Failed to delete keys [${deleteKeys.join(', ')}] from DB:`, delErr);
        }
      }

      // Execute batched upserts
      if (bulkUpsertOperations.length > 0) {
        try {
          // Security: The filter and update objects passed to bulkWrite use user/AI-provided data
          // as values, not as query operators, preventing NoSQL injection.
          const result = await UserMemory.bulkWrite(bulkUpsertOperations);
          logger.info(`[UserMemory] Consolidated ${result.upsertedCount} new facts and updated ${result.modifiedCount} existing facts.`);
        } catch (dbErr) {
          logger.error(`[UserMemory] Failed to consolidate facts via bulkWrite for user ${userId}:`, dbErr);
        }
      }

    } catch (err) {
      logger.error('[UserMemory] Unexpected error in asyncFactExtraction background worker:', err);
    }
  }, 0);
};

/**
 * @typedef {object} UserMemoryService
 * @property {function(string): Promise<string>} getProfileBlock - Retrieves and formats a user's persistent memories.
 * @property {function(string, string, string): void} asyncExtractFacts - Asynchronously extracts and consolidates facts from a conversation turn.
 */

/**
 * Exports the user memory service functions.
 * @type {UserMemoryService}
 */
export const userMemoryService = {
  getProfileBlock,
  asyncExtractFacts,
};