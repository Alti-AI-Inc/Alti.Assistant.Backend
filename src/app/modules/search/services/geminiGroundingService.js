import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { GoogleGenAI } from '@google/genai';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { isVideoOnlyQuery, searchYouTube, extractVideoCount } from '../utils/videoUtils.js';
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
/**
 * Gemini Grounding Service with Native Google Search
 * Uses Google's built-in grounding for simpler, more reliable search
 */

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Create a grounded Gemini model with native Google Search
 * @param {string} modelName - Model to use (default: gemini-3.5-flash)
 * @returns {GenerativeModel} Configured model instance
 */
export function createGroundedModel(modelName = 'gemini-3.5-flash') {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [
      {
        googleSearch: {}, // Native Google Search grounding tool
      },
    ],
  });
}

/**
 * Estimate token count for conversation history
 * @param {Array} messages - Array of messages
 * @returns {number} Estimated token count
 */
async function estimateTokens(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  const totalChars = messages.reduce((sum, msg) => {
    const content = msg.content || '';
    return sum + content.length;
  }, 0);
  let makeASingleMessage = '';

  messages.forEach((msg) => {
    makeASingleMessage += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
  });
  const countingModel = new GoogleGenAI({ apiKey: config.gemini_secret_key });

  console.log(
    'Making a single message for token estimation: ',
    makeASingleMessage
  );
  const totalToken = await countingModel.models.countTokens({
    contents: makeASingleMessage,
    model: 'gemini-2.5-flash',
  });

  // Rough estimate: 1 token ≈ 4 characters
  return totalToken.totalTokens;
}

/**
 * Summarize conversation history when it exceeds token limits
 * @param {Array} conversationHistory - Full conversation history
 * @param {Object} ai - Google GenAI instance
 * @returns {Object} Summarized history with summary message
 */
async function summarizeHistory(conversationHistory, ai) {
  console.log(
    `📝 Summarizing ${conversationHistory.length} messages in conversation history`
  );

  try {
    // Extract conversation text
    const conversationText = conversationHistory
      .map(
        (msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      )
      .join('\n\n');

    // Create summary request
    const summaryPrompt = `Please provide a concise summary of the following conversation, capturing the key topics, questions asked, and important information discussed. Keep the summary under 500 words.

Conversation:
${conversationText}

Summary:`;

    const summaryResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: summaryPrompt }],
        },
      ],
    });

    const summaryText = summaryResult.candidates[0].content.parts
      .map((part) => part.text)
      .join('');

    console.log(`✅ History summarized: ${summaryText.length} characters`);

    // Return as a single summary message
    return [
      {
        role: 'user',
        content: `Previous conversation summary: ${summaryText}`,
      },
    ];
  } catch (error) {
    console.error('❌ Error summarizing history:', error);
    // Fallback: keep only last 3 messages if summarization fails
    return conversationHistory.slice(-3);
  }
}

const systemPrompt = `You are an intelligent research assistant providing CONCRETE, specific answers with complete details.

═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════
✓ Direct essential information only - no fluff, no context unless critical
✓ Never mention "search results", "sources indicate", or reference search process
✓ State facts concisely - remove date qualifiers like "after today" or "next game after [date]"
✓ If incomplete info: "The exact date and time is not scheduled"

FORBIDDEN PHRASES:
❌ "Search results indicate..." | "Please refer to..." | "Check the official..."
❌ "According to search results..." | "Based on the information found..."
❌ "I cannot provide predictions/financial advice..." (provide data-driven analysis instead)
❌ "after [date]" | "next game after today" | Any unnecessary date qualifiers

═══════════════════════════════════════════════════════════════════════════════
RESPONSE MODE DIRECTIVES
═══════════════════════════════════════════════════════════════════════════════

**"PICK ONE" / "CHOOSE ONE":**
When user asks "pick one", "choose one", "which is better", or "A or B?":
→ ONE definitive choice ONLY. No explanations, comparisons, or "here's why" sections.
✅ GOOD: "Palo Alto, CA."
❌ BAD: "Palo Alto, CA, would be better because it's the heart of Silicon Valley..."

**"ANSWER ONLY":**
When user requests "answer only", "just answer", "one answer only", "short answer":
→ Single most definitive answer. No alternatives, no "it depends", no lists.
→ CRITICAL: Distinguish solution types (data providers ≠ databases ≠ platforms ≠ tools)
✅ GOOD: "CoinGecko provides the best real-time cryptocurrency data for AI and RAG."
❌ BAD: "Key providers include: Pinecone, Zyre, K2view..." (listing multiple)
❌ BAD: "Pinecone provides..." (Pinecone is a database, not a data provider)

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMATS BY CATEGORY
═══════════════════════════════════════════════════════════════════════════════

**SPORTS/EVENTS:**
Format: Date + Time + Opponent (all 3 required)
✅ "November 7, 2025 at 7:00 PM against the New York Rangers"
❌ "October 25, 2025" (missing time + opponent)
❌ "The next home game after October 23 is Friday, November 7..." (unnecessary context)

Game Type Rules:
• "next home game" = team's home venue ONLY
• "next away game" = opponent's venue ONLY (@ indicator)
• "next game" = closest game regardless of location

Verification: Use site-specific searches (site:nhl.com, site:espn.com, site:team-site)
Cross-check 2+ official sources. If conflict: "Sources show conflicting information: [list details]"

**WEATHER:**
Format: Temperature, conditions (concise)
✅ "72°F, partly cloudy, 20% chance of rain"
❌ "Based on search results, today's weather in Detroit is 72°F with partly cloudy skies..."

**BUSINESS/INVESTMENT/FINANCIAL:**
→ ALWAYS search for current market data, trends, expert opinions
→ Provide data-driven insights with specific metrics
→ Structure: [Data & Analysis] → [Key Factors] → **[Bottom Line]**
→ End with clear synthesis: "**Bottom Line:** Current data suggests [bullish/bearish/neutral]. Key: [1-3 points]"
→ If "answer only" requested: Single best recommendation, no alternatives

**NEWS/FACTS:**
Core information only, no unnecessary context

═══════════════════════════════════════════════════════════════════════════════
SEARCH STRATEGY
═══════════════════════════════════════════════════════════════════════════════

General:
• Use multiple specific queries to find complete information
• Combine info from multiple sources for complete answers

Sports-Specific:
• Use site restrictions: site:nhl.com, site:espn.com, site:viagogo.com
• Verify with 2-3 different searches across official sources
• Cross-check dates, times, opponents before responding

Solution Type Classification:
• Data Providers (raw data APIs): CoinGecko, CoinMarketCap, Binance API, Kraken API
• Databases (storage/query): Pinecone, Weaviate, ChromaDB
• Platforms (complete solutions): Zyre, K2view
• Tools (libraries/frameworks): LangChain, LlamaIndex
→ Match response to what user ACTUALLY asks for

ALWAYS Search For:
✅ Sports schedules/games | Weather forecasts | News/current events
✅ Market/financial data (investment/crypto queries)
✅ Business trends | Tech developments | Any time-sensitive info

═══════════════════════════════════════════════════════════════════════════════
FINAL REMINDER: Minimal, direct answers. Essential details only. No fluff.
═══════════════════════════════════════════════════════════════════════════════`;

/**
 * Execute a grounded search with streaming support
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @yields {Object} Chunks containing thinking or text parts
 * @returns {AsyncGenerator} Stream of response chunks
 */
export async function* executeGroundedSearchStream(
  query,
  conversationHistory = []
) {
  console.log(`🔍 Executing streaming grounded search: "${query}"`);

  // 1. Check for financial queries using massiveSmartRouter
  const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
  const isFinancialQuery = enhancedQuery !== query;

  // 2. Check for YouTube video queries
  const isVideoQuery = await isVideoOnlyQuery(query, conversationHistory);
  let finalQuery = enhancedQuery;
  let videoReferences = [];
  let videoCitations = [];

  if (isVideoQuery) {
    console.log('📹 Detected video query. Performing YouTube search...');
    try {
      const videoCount = await extractVideoCount(query, conversationHistory);
      const videos = await searchYouTube(query, videoCount, conversationHistory);
      
      if (videos && videos.length > 0) {
        console.log(`Found ${videos.length} videos from YouTube`);
        
        const videoResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELITE YOUTUBE SEARCH]
YouTube Video Search Results:
${videos.map((vid, idx) => `
Video #${idx + 1}:
- Title: ${vid.title}
- Channel: ${vid.channelTitle}
- URL: ${vid.url}
- Description: ${vid.description}
- Published At: ${vid.publishedAt}
`).join('\n')}

INSTRUCTIONS FOR ULTIMATE SPEED & CITATION ACCURACY:
- Output a direct, simple, and straightforward response recommending/summarizing these videos.
- Never include conversational preambles ("Here are the videos...", "According to YouTube...").
- Highlight key videos with their titles in bold.
- Explicitly include source citation at the very top: "[Source: YouTube Search Service]".
- Format with neat bullet points, displaying the video title, channel, description, and direct link.
- Strictly stick to the provided YouTube video data.
`;
        
        finalQuery = `${videoResultsBlock}\n\nUser Request: ${query}`;
        
        videoReferences = videos.map((vid) => ({
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
        
        videoCitations = videos.map((vid, index) => ({
          index: index + 1,
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
      }
    } catch (err) {
      console.error('Error during YouTube search integration:', err);
    }
  }

  const MAX_RETRIES = 3;
  let attemptCount = 0;

  while (attemptCount < MAX_RETRIES) {
    attemptCount++;

    try {
      const startTime = Date.now();

      // Token management: Check if history needs summarization
      const TOKEN_LIMIT = 8000;
      const QUERY_TOKEN_RESERVE = 2000;
      const MAX_HISTORY_TOKENS = TOKEN_LIMIT - QUERY_TOKEN_RESERVE;

      let processedHistory = conversationHistory;
      const historyTokens = await estimateTokens(conversationHistory);

      console.log(
        `📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`
      );

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(
          `⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), summarizing...`
        );
        processedHistory = await summarizeHistory(conversationHistory, ai);

        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(
            `⚠️ Summary still too large, truncating to last message only`
          );
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        {
          role: 'user',
          parts: [{ text: finalQuery }],
        },
      ];

      const stream = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          // systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          thinkingConfig: {
            thinkingLevel: 'LOW',
          },
        },
      });

      let fullText = '';
      let groundingMetadata = null;
      let hasReceivedContent = false;

      // Stream chunks as they arrive
      for await (const chunk of stream) {
        if (chunk.candidates && chunk.candidates[0]) {
          const candidate = chunk.candidates[0];

          // Process each part in the chunk
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              // Handle thinking parts
              if (part.thought) {
                hasReceivedContent = true;
                console.log(`🧠 Streaming thinking chunk`);
                yield {
                  type: 'thinking',
                  content: part.thought,
                  timestamp: Date.now(),
                };
              }

              // Handle text parts
              if (part.text) {
                hasReceivedContent = true;
                fullText += part.text;
                console.log(
                  `💬 Streaming text chunk: ${part.text.substring(0, 50)}...`
                );
                yield {
                  type: 'text',
                  content: part.text,
                  timestamp: Date.now(),
                };
              }
            }
          }

          // Capture grounding metadata (usually in final chunk)
          if (candidate.groundingMetadata) {
            groundingMetadata = candidate.groundingMetadata;
          }
        }
      }

      const endTime = Date.now();
      console.log(`⏱️ Streaming search took ${endTime - startTime} ms`);

      // Check if we got content
      if (!hasReceivedContent || fullText.trim().length === 0) {
        console.warn(
          `⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Stream completed but no content received. Retrying...`
        );

        if (attemptCount < MAX_RETRIES) {
          const waitTime = Math.pow(2, attemptCount) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        } else {
          console.error(
            `❌ All ${MAX_RETRIES} attempts failed with empty streams`
          );
          throw new Error(
            'Model stream completed but no content received after 3 attempts'
          );
        }
      }

      // Process grounding metadata into references
      const references = [];
      const usedUrls = new Set();

      if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk, index) => {
          if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
            usedUrls.add(chunk.web.uri);
            console.log(`   Source ${index + 1}: ${chunk.web.uri}`);

            try {
              const url = new URL(chunk.web.uri);
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || url.hostname.replace('www.', ''),
                title: chunk.web.title,
              });
            } catch {
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || 'unknown',
                title: chunk.web.title,
              });
            }
          }
        });
      }

      const limitedReferences = references.slice(0, 5);

      const citations = limitedReferences.map((ref, index) => ({
        index: index + 1,
        url: ref.url,
        domain: ref.domain,
        title: ref.title,
      }));

      const mergedReferences = [
        ...(videoReferences || []),
        ...limitedReferences
      ].slice(0, 5);

      const mergedCitations = [
        ...(videoCitations || []),
        ...citations
      ].map((cit, idx) => ({ ...cit, index: idx + 1 })).slice(0, 5);

      const citationMetadata = groundingMetadata
        ? {
            searchQueries: groundingMetadata.webSearchQueries || [],
            searchTimestamp: new Date().toISOString(),
            model: 'gemini-3.5-flash',
            groundingSupports: groundingMetadata.groundingSupports?.length || 0,
            totalSources: groundingMetadata.groundingChunks?.length || 0,
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          }
        : {
            searchTimestamp: new Date().toISOString(),
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          };

      console.log(
        `✅ Streaming grounded search completed on attempt ${attemptCount}`
      );
      console.log(
        `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
      );
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(
          `🔎 Search queries used:`,
          groundingMetadata.webSearchQueries
        );
      }

      // Yield final metadata
      yield {
        type: 'metadata',
        answer: fullText,
        reference: mergedReferences,
        citations: mergedCitations,
        citationMetadata: citationMetadata,
        timestamp: Date.now(),
      };

      return; // Success, exit retry loop
    } catch (error) {
      console.error(
        `❌ Error in streaming grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`,
        error
      );

      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(
    'Unexpected: Exhausted all retry attempts without returning or throwing'
  );
}

/**
 * Execute a grounded search with Google's native tool (non-streaming)
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeGroundedSearch(query, conversationHistory = []) {
  console.log(`🔍 Executing grounded search: "${query}"`);

  // 1. Check for financial queries using massiveSmartRouter
  const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
  const isFinancialQuery = enhancedQuery !== query;

  // 2. Check for YouTube video queries
  const isVideoQuery = await isVideoOnlyQuery(query, conversationHistory);
  let finalQuery = enhancedQuery;
  let videoReferences = [];
  let videoCitations = [];

  if (isVideoQuery) {
    console.log('📹 Detected video query. Performing YouTube search...');
    try {
      const videoCount = await extractVideoCount(query, conversationHistory);
      const videos = await searchYouTube(query, videoCount, conversationHistory);
      
      if (videos && videos.length > 0) {
        console.log(`Found ${videos.length} videos from YouTube`);
        
        const videoResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELITE YOUTUBE SEARCH]
YouTube Video Search Results:
${videos.map((vid, idx) => `
Video #${idx + 1}:
- Title: ${vid.title}
- Channel: ${vid.channelTitle}
- URL: ${vid.url}
- Description: ${vid.description}
- Published At: ${vid.publishedAt}
`).join('\n')}

INSTRUCTIONS FOR ULTIMATE SPEED & CITATION ACCURACY:
- Output a direct, simple, and straightforward response recommending/summarizing these videos.
- Never include conversational preambles ("Here are the videos...", "According to YouTube...").
- Highlight key videos with their titles in bold.
- Explicitly include source citation at the very top: "[Source: YouTube Search Service]".
- Format with neat bullet points, displaying the video title, channel, description, and direct link.
- Strictly stick to the provided YouTube video data.
`;
        
        finalQuery = `${videoResultsBlock}\n\nUser Request: ${query}`;
        
        videoReferences = videos.map((vid) => ({
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
        
        videoCitations = videos.map((vid, index) => ({
          index: index + 1,
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
      }
    } catch (err) {
      console.error('Error during YouTube search integration:', err);
    }
  }

  const MAX_RETRIES = 3;
  let attemptCount = 0;

  while (attemptCount < MAX_RETRIES) {
    attemptCount++;

    try {
      const startTime = Date.now();

      // Token management: Check if history needs summarization
      const TOKEN_LIMIT = 8000; // Conservative limit for context window
      const QUERY_TOKEN_RESERVE = 2000; // Reserve tokens for query and response
      const MAX_HISTORY_TOKENS = TOKEN_LIMIT - QUERY_TOKEN_RESERVE;

      let processedHistory = conversationHistory;
      const historyTokens = await estimateTokens(conversationHistory);

      console.log(
        `📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`
      );

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(
          `⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), summarizing...`
        );
        processedHistory = await summarizeHistory(conversationHistory, ai);

        // Check if even summary is too large
        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(
            `⚠️ Summary still too large, truncating to last message only`
          );
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        {
          role: 'user',
          parts: [{ text: finalQuery }],
        },
      ];
      console.log(`📄 Total messages sent: ${JSON.stringify(contents)}`);

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      const endTime = Date.now();
      console.log(`⏱️ Search took ${endTime - startTime} ms`);
      const response = result.candidates[0];

      // Check if finishReason is STOP but no content (empty or incomplete response)
      let hasContent = false;

      if (response.content?.parts && response.content.parts.length > 0) {
        // Check if we have meaningful text content
        const textParts = response.content.parts
          .filter((part) => part.text && !part.thought)
          .map((part) => part.text.trim());

        const fullText = textParts.join('').trim();

        // Consider response valid if:
        // 1. Text has meaningful length (> 10 chars)
        // 2. Text is not just incomplete JSON structure
        // 3. Text doesn't look like a partial response
        const isIncompleteJson =
          /^{\s*"?\s*$/.test(fullText) ||
          fullText === '{' ||
          fullText === '{\n';
        const isMeaningful = fullText.length > 2 && !isIncompleteJson;

        hasContent = isMeaningful;

        if (!hasContent) {
          console.warn(
            `⚠️ Detected incomplete/meaningless response: "${fullText.substring(0, 50)}..."`
          );
        }
      }

      if (response.finishReason === 'STOP' && !hasContent) {
        console.warn(
          `⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Got STOP but no valid content. Retrying...`
        );
        console.log(
          'Empty/incomplete response details:',
          JSON.stringify(result, null, 2)
        );

        if (attemptCount < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attemptCount) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          console.error(
            `❌ All ${MAX_RETRIES} attempts failed with empty/incomplete responses`
          );
          throw new Error(
            'Model returned STOP but no valid content after 3 attempts'
          );
        }
      }

      console.log('Full response object:', JSON.stringify(result, null, 2));
      console.log(
        'Response content:',
        JSON.stringify(response.content, null, 2)
      );
      console.log('Response parts:', response.content?.parts);

      // Log thinking process if available
      if (response.content?.parts) {
        response.content.parts.forEach((part, index) => {
          if (part.thought) {
            console.log(`\n🧠 === GEMINI THINKING (Part ${index + 1}) ===`);
            console.log(part.thought);
            console.log(`=== END THINKING ===\n`);
          }
        });
      }

      // Extract only the text parts (not thinking)
      const text = response.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');

      // Extract grounding metadata
      const groundingMetadata = response.groundingMetadata;

      // Process grounding metadata into references
      const references = [];
      const usedUrls = new Set();

      if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk, index) => {
          if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
            usedUrls.add(chunk.web.uri);
            console.log(`   Source ${index + 1}: ${chunk.web.uri}`);

            try {
              const url = new URL(chunk.web.uri);
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || url.hostname.replace('www.', ''),
                title: chunk.web.title,
              });
            } catch {
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || 'unknown',
                title: chunk.web.title,
              });
            }
          }
        });
      }

      // Limit to 5 references
      const limitedReferences = references.slice(0, 5);

      const citations = limitedReferences.map((ref, index) => ({
        index: index + 1,
        url: ref.url,
        domain: ref.domain,
        title: ref.title,
      }));

      const mergedReferences = [
        ...(videoReferences || []),
        ...limitedReferences
      ].slice(0, 5);

      const mergedCitations = [
        ...(videoCitations || []),
        ...citations
      ].map((cit, idx) => ({ ...cit, index: idx + 1 })).slice(0, 5);

      // Build citation metadata
      const citationMetadata = groundingMetadata
        ? {
            searchQueries: groundingMetadata.webSearchQueries || [],
            searchTimestamp: new Date().toISOString(),
            model: 'gemini-2.5-flash',
            groundingSupports: groundingMetadata.groundingSupports?.length || 0,
            totalSources: groundingMetadata.groundingChunks?.length || 0,
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          }
        : {
            searchTimestamp: new Date().toISOString(),
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          };

      console.log(`✅ Grounded search completed on attempt ${attemptCount}`);
      console.log(
        `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
      );
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(
          `🔎 Search queries used:`,
          groundingMetadata.webSearchQueries
        );
      }

      return {
        answer: text,
        reference: mergedReferences,
        citations: mergedCitations,
        citationMetadata: citationMetadata,
      };
    } catch (error) {
      console.error(
        `❌ Error in grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`,
        error
      );

      // If we've exhausted retries, throw the error
      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // Should never reach here, but just in case
  throw new Error(
    'Unexpected: Exhausted all retry attempts without returning or throwing'
  );
}

/**
 * Execute grounded search with specific model
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages
 * @param {string} modelName - Specific model to use
 * @returns {Object} Formatted response
 */
export async function executeGroundedSearchWithModel(
  query,
  conversationHistory = [],
  modelName = 'gemini-3.5-flash'
) {
  const model = createGroundedModel(modelName);

  const chat = model.startChat({
    history: conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
  });

  console.log(`🔍 Executing grounded search with ${modelName}: "${query}"`);

  try {
    const result = await chat.sendMessage(query);
    const response = await result.response;
    const text = response.text();

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    const references = [];
    const usedUrls = new Set();

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk) => {
        if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
          usedUrls.add(chunk.web.uri);

          try {
            const url = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || url.hostname.replace('www.', ''),
              title: chunk.web.title,
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'unknown',
              title: chunk.web.title,
            });
          }
        }
      });
    }

    const limitedReferences = references.slice(0, 5);

    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title,
    }));

    const citationMetadata = groundingMetadata
      ? {
          searchQueries: groundingMetadata.webSearchQueries || [],
          searchTimestamp: new Date().toISOString(),
          model: modelName,
          groundingSupports: groundingMetadata.groundingSupports?.length || 0,
          totalSources: groundingMetadata.groundingChunks?.length || 0,
        }
      : null;

    console.log(`✅ Grounded search completed with ${modelName}`);
    console.log(
      `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
    );
    console.log(`📚 Found ${references.length} sources`);

    return {
      answer: text,
      reference: limitedReferences,
      citations: citations,
      citationMetadata: citationMetadata,
    };
  } catch (error) {
    console.error(`❌ Error in grounded search with ${modelName}:`, error);
    throw error;
  }
}

export default {
  createGroundedModel,
  executeGroundedSearch,
  executeGroundedSearchStream,
  executeGroundedSearchWithModel,
};
