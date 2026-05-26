import UserMemory from './userMemory.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import fetch from 'node-fetch';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

const FACT_EXTRACTION_PROMPT = `You are a cognitive memory manager for a state-of-the-art AI Assistant.
Your job is to analyze the conversation turn (the User's Prompt and the Assistant's Reply) and extract any concrete, long-term personal facts, attributes, or preferences about the user.

Rules:
1. Only extract high-confidence, stable facts explicitly stated or strongly implied (e.g., user's profession, location, programming language/tech stack, company, preferred response style/formatting/tone, hobbies, interests, etc.).
2. Do NOT extract temporary conversation topics, questions, or short-term requests (e.g., "user is asking about stock prices", "user wants to write an email now"). Only extract things that remain true about the user across different sessions.
3. Key names must be normalized, lowercase, using underscores (e.g., "tech_stack", "profession", "location", "preferred_tone", "interests", "company").
4. Values must be clear, concise, and direct.

You MUST respond strictly with a valid JSON array of objects, where each object matches this schema:
{
  "key": "string (normalized key name)",
  "value": "string (the fact/preference value)",
  "category": "string (must be 'facts' or 'preferences')"
}
If no new facts or preferences are found, respond with exactly an empty array: [].
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
 * Asynchronously extracts new facts and preferences from a conversation turn and upserts them into MongoDB.
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
      logger.info(`[UserMemory] Background fact extraction triggered for user ${userId}`);
      
      const turnText = `USER PROMPT:\n"${prompt}"\n\nASSISTANT REPLY:\n"${reply}"`;
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
        logger.warn(`[UserMemory] Gemini extraction failed: ${geminiErr.message}. Falling back to Groq Llama-3.3...`);
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.groq_secret_key || process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: FACT_EXTRACTION_PROMPT },
                { role: 'user', content: turnText }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1
            })
          });

          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            rawJson = groqData.choices?.[0]?.message?.content || '[]';
          } else {
            const errBody = await groqResponse.text();
            throw new Error(`Groq returned status ${groqResponse.status}: ${errBody}`);
          }
        } catch (groqErr) {
          logger.error('[UserMemory] Both Gemini and Groq fact extraction failed:', groqErr);
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
        logger.info('[UserMemory] No new facts or preferences detected in this turn.');
        return;
      }

      logger.info(`[UserMemory] Successfully extracted ${extractedFacts.length} candidate facts for user ${userId}.`);

      // Upsert each fact securely
      for (const fact of extractedFacts) {
        if (!fact.key || !fact.value) continue;
        
        const normalizedKey = fact.key.toLowerCase().trim();
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
          logger.info(`[UserMemory] Upserted memory fact: [${normalizedKey}] => "${cleanValue}"`);
        } catch (dbErr) {
          logger.error(`[UserMemory] Failed to upsert fact [${normalizedKey}] to DB:`, dbErr);
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
