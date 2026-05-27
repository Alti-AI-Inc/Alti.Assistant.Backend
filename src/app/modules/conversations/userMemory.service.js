import UserMemory from './userMemory.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import fetch from 'node-fetch';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

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
 * Retrieves all persistent memories for a user and compiles them into a structured text block for the LLM.
 * @param {string} userId - User identifier
 * @returns {Promise<string>} Formatted markdown block or empty string
 */
const getProfileBlock = async (userId) => {
  if (!userId) return '';
  try {
    const memories = await UserMemory.find({ userId });
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
 * Asynchronously extracts new facts and preferences from a conversation turn, resolves conflicts with existing memories,
 * and consolidates them inside MongoDB (upserting or deleting keys).
 * Fired in the background (non-blocking).
 * @param {string} userId - User identifier
 * @param {string} prompt - User's prompt
 * @param {string} reply - Assistant's reply
 */
const asyncExtractFacts = async (userId, prompt, reply) => {
  if (!userId || !prompt || !reply) return;

  // Run in background wrap with try-catch to protect the core execution thread
  setTimeout(async () => {
    try {
      logger.info(`[UserMemory] Background fact extraction and consolidation triggered for user ${userId}`);
      
      // 1. Fetch existing memories to allow cognitive conflict resolution and prevent duplicate writes
      const existingMemories = await UserMemory.find({ userId });
      let existingSummary = 'None';
      if (existingMemories && existingMemories.length > 0) {
        existingSummary = existingMemories
          .map((m) => `- key: "${m.key}", value: "${m.value}", category: "${m.category}"`)
          .join('\n');
      }

      const turnText = `EXISTING USER PROFILE & MEMORIES:\n${existingSummary}\n\nNEW CONVERSATION TURN:\nUSER PROMPT:\n"${prompt}"\n\nASSISTANT REPLY:\n"${reply}"`;
      let rawJson = '[]';

      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
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
        logger.warn(`[UserMemory] Gemini extraction failed: ${geminiErr.message}. Falling back to Azure AI Foundry...`);
        try {
          if (!config.azure.endpoint || !config.azure.apiKey) {
            throw new Error('Azure AI Foundry endpoint or key is not configured.');
          }

          const { endpoint, apiKey, deploymentOrModel, apiVersion } = config.azure;
          const isAzureOpenAI = endpoint.includes('openai.azure.com') || endpoint.includes('deployments');

          let requestUrl = endpoint;
          let headers = {
            'Content-Type': 'application/json',
          };

          if (isAzureOpenAI) {
            headers['api-key'] = apiKey;
            if (!requestUrl.includes('/openai/deployments/')) {
              const baseUrl = requestUrl.split('/openai')[0];
              requestUrl = `${baseUrl}/openai/deployments/${deploymentOrModel}/chat/completions?api-version=${apiVersion}`;
            }
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            if (!requestUrl.includes('/chat/completions')) {
              requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
          }

          const response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...(isAzureOpenAI ? {} : { model: deploymentOrModel }),
              messages: [
                { role: 'system', content: FACT_EXTRACTION_PROMPT },
                { role: 'user', content: turnText }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1
            })
          });

          if (response.ok) {
            const data = await response.json();
            rawJson = data.choices?.[0]?.message?.content || '[]';
          } else {
            const errBody = await response.text();
            throw new Error(`Azure AI Foundry returned status ${response.status}: ${errBody}`);
          }
        } catch (azureErr) {
          logger.error('[UserMemory] Both Gemini and Azure AI Foundry fact extraction failed:', azureErr);
          return;
        }
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

      // Execute each memory directive securely (upsert or delete)
      for (const fact of extractedFacts) {
        if (!fact.key) continue;
        
        const normalizedKey = fact.key.toLowerCase().trim();
        const action = fact.action === 'delete' ? 'delete' : 'upsert';

        if (action === 'delete') {
          try {
            await UserMemory.deleteOne({ userId, key: normalizedKey });
            logger.info(`[UserMemory] Successfully redacted memory key: [${normalizedKey}]`);
          } catch (delErr) {
            logger.error(`[UserMemory] Failed to delete key [${normalizedKey}] from DB:`, delErr);
          }
        } else {
          if (!fact.value) continue;
          const cleanValue = fact.value.trim();
          const category = ['facts', 'preferences', 'settings'].includes(fact.category) ? fact.category : 'facts';

          try {
            await UserMemory.findOneAndUpdate(
              { userId, key: normalizedKey },
              {
                value: cleanValue,
                category,
                confidence: fact.confidence || 1.0,
              },
              { upsert: true, new: true, runValidators: true }
            );
            logger.info(`[UserMemory] Consolidated memory fact: [${normalizedKey}] => "${cleanValue}"`);
          } catch (dbErr) {
            logger.error(`[UserMemory] Failed to consolidate fact [${normalizedKey}] to DB:`, dbErr);
          }
        }
      }
    } catch (err) {
      logger.error('[UserMemory] Unexpected error in asyncFactExtraction background worker:', err);
    }
  }, 0);
};

export const userMemoryService = {
  getProfileBlock,
  asyncExtractFacts,
};
