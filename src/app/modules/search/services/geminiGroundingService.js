import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../../../../../config/index.js";
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
/**
 * Gemini Grounding Service with Native Google Search
 * Uses Google's built-in grounding for simpler, more reliable search
 */

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Create a grounded Gemini model with native Google Search
 * @param {string} modelName - Model to use (default: gemini-3-flash-preview)
 * @returns {GenerativeModel} Configured model instance
 */
export function createGroundedModel(modelName = "gemini-3-flash-preview") {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [
      {
        googleSearch: {} // Native Google Search grounding tool
      }
    ]
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
  let makeASingleMessage = ''

  messages.forEach(msg => {
    makeASingleMessage += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
  });
  const countingModel = new GoogleGenAI({ apiKey: config.gemini_secret_key });

  console.log('Making a single message for token estimation: ', makeASingleMessage);
  const totalToken = await countingModel.models.countTokens({ contents: makeASingleMessage, model: 'gemini-2.5-flash' });

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
  console.log(`📝 Summarizing ${conversationHistory.length} messages in conversation history`);

  try {
    // Extract conversation text
    const conversationText = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    // Create summary request
    const summaryPrompt = `Please provide a concise summary of the following conversation, capturing the key topics, questions asked, and important information discussed. Keep the summary under 500 words.

Conversation:
${conversationText}

Summary:`;

    const summaryResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: 'user',
        parts: [{ text: summaryPrompt }]
      }]
    });

    const summaryText = summaryResult.candidates[0].content.parts.map(part => part.text).join('');

    console.log(`✅ History summarized: ${summaryText.length} characters`);

    // Return as a single summary message
    return [{
      role: 'user',
      content: `Previous conversation summary: ${summaryText}`
    }];

  } catch (error) {
    console.error('❌ Error summarizing history:', error);
    // Fallback: keep only last 3 messages if summarization fails
    return conversationHistory.slice(-3);
  }
}

const systemPrompt = `You are an intelligent research assistant that provides CONCRETE, specific answers with complete details.

CORE PRINCIPLE: PROVIDE DIRECT, ESSENTIAL INFORMATION ONLY
- For direct questions (sports schedules, dates, times, facts), provide ONLY the essential details
- NO unnecessary context or date qualifiers like "after [current date]" or "next game after today is"
- NO vague responses like "please refer to official schedule" or "search results indicate"
- If information is incomplete, state it simply: "The exact date and time is not scheduled"
- NEVER mention "search results" or reference the search process in your answer
- State facts directly and concisely - just the core information requested

**"PICK ONE" / "CHOOSE ONE" DIRECTIVE:**
When user asks to "pick one", "choose one", "which is better", or presents an either/or choice (e.g., "A or B?"):
- Provide ONLY ONE definitive choice
- NO explanations of both options
- NO "here's why" sections that explain the chosen option in detail
- NO comparison of alternatives or listing pros/cons
- Format: Single sentence stating the choice
- Examples:
  ❌ BAD: "Palo Alto, CA, would be the better location for the alti company's headquarters.\n\nPalo Alto is the symbolic and geographic heart of Silicon Valley's venture capital industry..."
  ✅ GOOD: "Palo Alto, CA."
  ❌ BAD: "For the alti company, Palo Alto would be better because..."
  ✅ GOOD: "Palo Alto, CA."

**"ANSWER ONLY" DIRECTIVE:**
When user explicitly requests "answer only" or similar phrases (e.g., "just answer", "one answer only", "short answer"):
- Provide ONLY the single most definitive answer
- NO multiple options, alternatives, or "it depends" responses
- NO explanations, context, or additional details unless absolutely necessary
- NO lists of providers or platforms - choose THE BEST one based on data
- **CRITICAL: Distinguish between different types of solutions** (e.g., databases vs data providers, tools vs platforms)
- **Understand what the user is ACTUALLY asking for** - if they ask for "data provider", don't give them a database
- Format: Single direct statement answering the question
- Examples:
  ❌ BAD: "Based on current market analysis, key providers include: Pinecone, Zyre, K2view..."
  ❌ BAD: "Pinecone provides the best real-time cryptocurrency data for AI and RAG applications." (Pinecone is a database, not a data provider)
  ✅ GOOD: "CoinGecko provides the best real-time cryptocurrency data for AI and RAG applications." (Actual data provider)

RESPONSE FORMATS (CONCISE):
- Sports/Event Schedules: MUST include date + time + opponent (e.g., "November 7, 2025 at 7:00 PM against the New York Rangers")
- **CRITICAL: Understand HOME vs AWAY games**
  - "next home game" = game at team's home venue ONLY
  - "next away game" = game at opponent's venue ONLY (usually indicated with @)
  - "next game" = closest game regardless of location
  - Always return the CLOSEST matching game after current date
- NEVER provide just a date alone - always include time and opponent for sports
- Weather: Temperature, conditions (skip verbose details unless asked)
- News/Facts: Core information without unnecessary context
- Business/Investment: Key findings and actionable insights

CONCRETE ANSWER EXAMPLES:
❌ BAD: "The next Detroit Red Wings home game after October 23, 2025, is on Friday, November 7, 2025, at 7:00 PM against the New York Rangers. The game will be broadcast on NHL Net."
❌ BAD: "October 25, 2025"
✅ GOOD: "November 7, 2025 at 7:00 PM against the New York Rangers"

❌ BAD: "The Detroit Red Wings' next home game after today's date is scheduled for October 15, 2025 at 7:30 PM against the Toronto Maple Leafs at Little Caesars Arena."
✅ GOOD: "October 15, 2025 at 7:30 PM against the Toronto Maple Leafs"

❌ BAD: "Based on the search results, today's weather in Detroit is 72°F with partly cloudy skies and a 20% chance of rain throughout the day."
✅ GOOD: "72°F, partly cloudy, 20% chance of rain"

FOR "NEXT GAME" QUERIES:
- User asks: "When is the next Detroit Red Wings home game?"
- ❌ BAD: Just the date "October 25, 2025"
- ✅ GOOD: "November 7, 2025 at 7:00 PM against the New York Rangers"
- MUST INCLUDE: date, time, AND opponent

SEARCH STRATEGY:
- Use multiple specific search queries to find complete information
- Search for current schedules, dates, times, and specific details
- For sports: search team schedules, upcoming games, specific dates
- **IMPORTANT FOR SPORTS:** Use site-specific searches (site:nhl.com, site:espn.com) to get accurate data
- **VERIFY sports information** by running 2-3 different search queries with specific site restrictions
- Combine information from multiple sources for complete answers
- For sports, cross-check dates and opponents across multiple official sources before responding
- **ANALYZE SEARCH RESULTS CAREFULLY:** Distinguish between different types of solutions:
  * Data Providers (APIs that provide raw data): CoinGecko, CoinMarketCap, Binance API, Kraken API, etc.
  * Databases (storage/query systems): Pinecone, Weaviate, ChromaDB, etc.
  * Platforms (complete solutions): Zyre, K2view, etc.
  * Tools (libraries/frameworks): LangChain, LlamaIndex, etc.
  When user asks for "data provider", only mention actual data API providers, NOT databases or platforms

FORBIDDEN PHRASES:
- "after [date]" or "next game after today"
- "Search results indicate..."
- "Please refer to..."
- "Check the official..."
- "According to search results..."
- "Based on the information found..."
- "I cannot provide predictions..." or "I cannot predict..."
- "I cannot provide financial advice..."
- Any unnecessary date context or qualifiers
- Any generic refusal to answer analytical questions

REQUIRED APPROACH:
- For sports queries, ALWAYS provide: date + time + opponent (all three required)
- NEVER provide just a date by itself for sports/game queries
- If user asks "when is next game", give full details: "November 7, 2025 at 7:00 PM against the New York Rangers"
- Provide essential details concisely but completely
- NO extra context, venue, or broadcast info unless specifically asked
- Use minimal, direct language
- Include what was directly asked for plus necessary context (time + opponent for games)

For business/financial/investment questions:
- MUST use search tools to gather current market data and expert analysis
- Provide data-driven insights based on current market conditions
- Include specific metrics, trends, and expert opinions from search results
- Give balanced analysis with both opportunities and risks
- NO generic disclaimers like "I cannot provide financial advice" - instead provide informational analysis
- Present findings objectively: "Based on current market analysis..." or "According to recent data..."
- Cite all sources used in your analysis

For sports, weather, news, or factual queries, provide exact details:
- Exact dates, times, opponents for events (skip venue unless asked)
- **CRITICAL FOR SPORTS:** Always verify information using multiple searches with site-specific queries
- Use site restrictions in searches: "site:nhl.com", "site:espn.com", "site:[team website]"
- Cross-reference information from at least 2 official sources before providing the answer
- If sources conflict, state: "Sources show conflicting information" and list what each source says
- Current conditions and forecasts (concise)
- Latest updates and facts (core info only)
- If exact details are not available, state it simply: "The exact date and time is not scheduled"
- If asks for schedules, provide only the schedule data
- For sports search on espn.com, nhl.com, www.viagogo.com, team site, or trusted sports sources

TOOL USAGE - SEARCH FOR:
✅ Current sports schedules and upcoming games
✅ Specific dates, times, and opponent information
✅ Weather forecasts and current conditions
✅ News updates and current events
✅ Market data and financial information - ALWAYS search for investment/crypto queries
✅ Business trends and analysis
✅ Technology developments
✅ Any factual, time-sensitive information

FOR INVESTMENT/FINANCIAL QUERIES:
- ALWAYS use search tools to gather current market data
- Search for: price trends, technical analysis, expert opinions, market sentiment
- Provide data-driven analysis, NOT generic disclaimers
- Present information objectively: "Current market analysis shows..." or "Recent data indicates..."
- Include specific metrics, predictions, and expert viewpoints from sources
- Balance opportunities with risks using actual market data
- **MUST provide a clear conclusion that synthesizes the data into actionable insights**
- Structure: [Data & Analysis] → [Key Factors] → **[Clear Conclusion/Bottom Line]**
- Answer the user's specific question (e.g., "Should I invest?") with a direct synthesis like: "**Bottom Line:** Current data suggests [bullish/bearish/neutral] signals. Key considerations: [1-3 specific points]."
- **IF "answer only" is requested:** Provide ONLY the single best/top recommendation with no alternatives or explanations

CRITICAL: Provide minimal, direct answers with only essential details. Remove all fluff and unnecessary context.`;

/**
 * Execute a grounded search with streaming support
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @yields {Object} Chunks containing thinking or text parts
 * @returns {AsyncGenerator} Stream of response chunks
 */
export async function* executeGroundedSearchStream(query, conversationHistory = []) {
  console.log(`🔍 Executing streaming grounded search: "${query}"`);

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

      console.log(`📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`);

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(`⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), summarizing...`);
        processedHistory = await summarizeHistory(conversationHistory, ai);

        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(`⚠️ Summary still too large, truncating to last message only`);
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        {
          role: 'user',
          parts: [{ text: query }]
        }
      ];

      const stream = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          thinkingConfig: {
            thinkingLevel: 'LOW'
          }
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
                  timestamp: Date.now()
                };
              }

              // Handle text parts
              if (part.text) {
                hasReceivedContent = true;
                fullText += part.text;
                console.log(`💬 Streaming text chunk: ${part.text.substring(0, 50)}...`);
                yield {
                  type: 'text',
                  content: part.text,
                  timestamp: Date.now()
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
        console.warn(`⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Stream completed but no content received. Retrying...`);

        if (attemptCount < MAX_RETRIES) {
          const waitTime = Math.pow(2, attemptCount) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          console.error(`❌ All ${MAX_RETRIES} attempts failed with empty streams`);
          throw new Error('Model stream completed but no content received after 3 attempts');
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
                title: chunk.web.title
              });
            } catch {
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || 'unknown',
                title: chunk.web.title
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
        title: ref.title
      }));

      const citationMetadata = groundingMetadata ? {
        searchQueries: groundingMetadata.webSearchQueries || [],
        searchTimestamp: new Date().toISOString(),
        model: "gemini-3-flash-preview",
        groundingSupports: groundingMetadata.groundingSupports?.length || 0,
        totalSources: groundingMetadata.groundingChunks?.length || 0
      } : null;

      console.log(`✅ Streaming grounded search completed on attempt ${attemptCount}`);
      console.log(`📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`);
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(`🔎 Search queries used:`, groundingMetadata.webSearchQueries);
      }

      // Yield final metadata
      yield {
        type: 'metadata',
        answer: fullText,
        reference: limitedReferences,
        citations: citations,
        citationMetadata: citationMetadata,
        timestamp: Date.now()
      };

      return; // Success, exit retry loop

    } catch (error) {
      console.error(`❌ Error in streaming grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`, error);

      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Unexpected: Exhausted all retry attempts without returning or throwing');
}

/**
 * Execute a grounded search with Google's native tool (non-streaming)
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeGroundedSearch(query, conversationHistory = []) {


  console.log(`🔍 Executing grounded search: "${query}"`);

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

      console.log(`📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`);

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(`⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), summarizing...`);
        processedHistory = await summarizeHistory(conversationHistory, ai);

        // Check if even summary is too large
        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(`⚠️ Summary still too large, truncating to last message only`);
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        {
          role: 'user',
          parts: [{ text: query }]
        }
      ];
      console.log(`📄 Total messages sent: ${JSON.stringify(contents)}`);

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          thinkingConfig: {
            thinkingLevel: 'LOW'
          }
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
          .filter(part => part.text && !part.thought)
          .map(part => part.text.trim());

        const fullText = textParts.join('').trim();

        // Consider response valid if:
        // 1. Text has meaningful length (> 10 chars)
        // 2. Text is not just incomplete JSON structure
        // 3. Text doesn't look like a partial response
        const isIncompleteJson = /^{\s*"?\s*$/.test(fullText) || fullText === '{' || fullText === '{\n';
        const isMeaningful = fullText.length > 2 && !isIncompleteJson;

        hasContent = isMeaningful;

        if (!hasContent) {
          console.warn(`⚠️ Detected incomplete/meaningless response: "${fullText.substring(0, 50)}..."`);
        }
      }

      if (response.finishReason === 'STOP' && !hasContent) {
        console.warn(`⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Got STOP but no valid content. Retrying...`);
        console.log('Empty/incomplete response details:', JSON.stringify(result, null, 2));

        if (attemptCount < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attemptCount) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          console.error(`❌ All ${MAX_RETRIES} attempts failed with empty/incomplete responses`);
          throw new Error('Model returned STOP but no valid content after 3 attempts');
        }
      }

      console.log('Full response object:', JSON.stringify(result, null, 2));
      console.log('Response content:', JSON.stringify(response.content, null, 2));
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
        .filter(part => part.text)
        .map(part => part.text)
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
                title: chunk.web.title
              });
            } catch {
              references.push({
                url: chunk.web.uri,
                domain: chunk.web.title || 'unknown',
                title: chunk.web.title
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
        title: ref.title
      }));

      // Build citation metadata
      const citationMetadata = groundingMetadata ? {
        searchQueries: groundingMetadata.webSearchQueries || [],
        searchTimestamp: new Date().toISOString(),
        model: "gemini-2.5-flash",
        groundingSupports: groundingMetadata.groundingSupports?.length || 0,
        totalSources: groundingMetadata.groundingChunks?.length || 0
      } : null;

      console.log(`✅ Grounded search completed on attempt ${attemptCount}`);
      console.log(`📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`);
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(`🔎 Search queries used:`, groundingMetadata.webSearchQueries);
      }

      return {
        answer: text,
        reference: limitedReferences,
        citations: citations,
        citationMetadata: citationMetadata
      };

    } catch (error) {
      console.error(`❌ Error in grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`, error);

      // If we've exhausted retries, throw the error
      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Should never reach here, but just in case
  throw new Error('Unexpected: Exhausted all retry attempts without returning or throwing');
}

/**
 * Execute grounded search with specific model
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages
 * @param {string} modelName - Specific model to use
 * @returns {Object} Formatted response
 */
export async function executeGroundedSearchWithModel(query, conversationHistory = [], modelName = "gemini-3-flash-preview") {
  const model = createGroundedModel(modelName);

  const chat = model.startChat({
    history: conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))
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
              title: chunk.web.title
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'unknown',
              title: chunk.web.title
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
      title: ref.title
    }));

    const citationMetadata = groundingMetadata ? {
      searchQueries: groundingMetadata.webSearchQueries || [],
      searchTimestamp: new Date().toISOString(),
      model: modelName,
      groundingSupports: groundingMetadata.groundingSupports?.length || 0,
      totalSources: groundingMetadata.groundingChunks?.length || 0
    } : null;

    console.log(`✅ Grounded search completed with ${modelName}`);
    console.log(`📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`);
    console.log(`📚 Found ${references.length} sources`);

    return {
      answer: text,
      reference: limitedReferences,
      citations: citations,
      citationMetadata: citationMetadata
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
  executeGroundedSearchWithModel
};
