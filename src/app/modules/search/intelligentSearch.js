// intelligentSearch.js - Main intelligent search orchestrator
import config from '../../../../config/index.js';
import { updateQueryWithCurrentYear } from './utils/queryUtils.js';
import { prepareConversationContext } from './utils/historyManager.js';
import {
  classifyQuery,
  classifyWritingRequest,
} from './services/queryClassifier.js';
import { ClaudeService } from './services/claudeService.js';
import { executeToolBasedConversation } from './services/reactAgent.js';
import Conversation from '../conversations/conversation.model.js';
import { openMemoryClient } from '../../shared/openMemoryClient.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import { isVideoOnlyQuery, searchYouTube, extractVideoCount } from './utils/videoUtils.js';
import { detectFinancialIntent } from '../../helpers/massiveTickerDB.js';

/**
 * Enhanced search function that uses tool-enabled LLM for intelligent search decisions
 *
 * ROUTING LOGIC:
 * 1. Writing requests (confidence >= 0.4) → Claude Direct (no search)
 * 2. Code requests (confidence >= 0.5) → Claude with ReAct search capability
 * 3. General/factual queries → Gemini with full tool-based search
 *
 * @param {Object} state - Contains query, conversationId, conversationContext, etc.
 * @param {boolean} stream - Whether to stream the response
 * @returns {Object} - Search result with answer, references, and metadata
 */
export const runIntelligentSearch = async (state, stream = false) => {
  try {
    console.log(
      '🔍 Running intelligent search with INTELLIGENT history management',
      state.conversationId
    );

    const query = updateQueryWithCurrentYear(
      state.currentQuery || state.query || ''
    );

    // Handle test scenarios where conversationId might be null or we have direct context
    let conversationContext;
    let existingSummary = state.conversationSummary || null;

    if (state.conversationContext !== undefined) {
      // If conversationContext is explicitly provided (e.g., in tests), use it directly
      conversationContext = state.conversationContext;
      console.log('Using provided conversation context');
    } else if (state.conversationId) {
      // Otherwise, fetch from database if conversationId is provided
      const conversation = await Conversation.findOne({
        conversationId: state.conversationId,
      });
      conversationContext = conversation ? conversation.messages : [];
    } else {
      // No conversationId and no context provided - start fresh
      conversationContext = [];
      console.log('No conversation context available - starting fresh');
    }

    console.log('Length of conversation context:', conversationContext.length);

    conversationContext = conversationContext.filter((item, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      return !(item.role === prev.role && item.content === prev.content);
    });

    // ── PRIORITY 0: Financial intent detection ────────────────────────────
    // Financial queries ALWAYS bypass writing/code routing to get live market data
    const financialIntent = detectFinancialIntent(query);
    const isFinancialQuery_precheck = !!financialIntent;
    if (isFinancialQuery_precheck) {
      console.log(`💹 [Massive Priority] Financial intent detected: ${financialIntent.type} (${financialIntent.symbol || 'no symbol'}) — bypassing writing/code classifier`);
    }

    // 1. Check for financial queries using massiveSmartRouter
    const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
    const isFinancialQuery = enhancedQuery !== query;

    // 2. Check for YouTube video queries
    const isVideoQuery = await isVideoOnlyQuery(query, conversationContext);
    let finalQuery = enhancedQuery;
    let videoReferences = [];
    let videoCitations = [];

    if (isVideoQuery) {
      console.log('📹 Detected video query. Performing YouTube search...');
      try {
        const videoCount = await extractVideoCount(query, conversationContext);
        const videos = await searchYouTube(query, videoCount, conversationContext);
        
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

    // 🧠 INTELLIGENT HISTORY MANAGEMENT - Automatically handle token limits
    console.log(
      `📊 Processing conversation with ${conversationContext.length} messages`
    );
    const contextResult = await prepareConversationContext(
      conversationContext,
      existingSummary,
      query
    );

    // Use the intelligently managed conversation context
    const conversationHistory = contextResult.formattedContext;
    let conversationHistoryWithMemory = conversationHistory;
    let classificationContext = conversationContext;
    const userId = state.userId || state.authUserId || state?.user?.id;

    if (openMemoryClient?.enabled && userId) {
      try {
        const memoryMatches = await openMemoryClient.queryMemories({
          query,
          userId,
        });
        if (memoryMatches.length) {
          console.log(
            `🧠 OpenMemory: retrieved ${memoryMatches.length} memories for user ${userId}`
          );
          const memoryHeader = '## Retrieved Memories:\n';
          const memoryLines = memoryMatches
            .map((match, idx) => {
              const sector =
                match?.primary_sector || match?.metadata?.sector || 'semantic';
              return `Memory ${idx + 1} (${sector}): ${match?.content}`;
            })
            .join('\n');

          conversationHistoryWithMemory = `${memoryHeader}${memoryLines}\n\n${conversationHistory}`;
          classificationContext = [
            ...memoryMatches.map((match) => ({
              role: 'assistant',
              content: `Referenced memory (${match?.primary_sector || match?.metadata?.sector || 'semantic'}): ${match?.content}`,
            })),
            ...conversationContext,
          ];

          memoryMatches.forEach((match) => {
            if (match?.id) {
              openMemoryClient.reinforceMemory(match.id).catch((err) => {
                console.warn(
                  `⚠️ Failed to reinforce OpenMemory id ${match.id}`,
                  err?.message || err
                );
              });
            }
          });
        }
      } catch (memoryError) {
        console.warn(
          '⚠️ OpenMemory query failed, continuing without memory context',
          memoryError
        );
      }
    }

    console.log(
      `✅ Context prepared: ${contextResult.contextTokens} tokens (managed: ${contextResult.isOptimized})`
    );
    if (contextResult.historyManaged) {
      console.log(
        `🔄 History optimized: ${contextResult.reductionPercentage}% token reduction`
      );
    }

    // 🎯 SMART ROUTING: Classify query to determine routing
    // ⚡ EXCEPTION: Financial queries always route to Gemini + Massive grounding, never to Claude-only paths
    if (config.routing.enableSmartRouting && !isFinancialQuery_precheck) {
      console.log(`🎯 Smart Routing enabled - Classifying query...`);

      // First check if it's a writing request
      const writingClassification = classifyWritingRequest(query);

      // Check if it's code-related
      const classification = classifyQuery(query, classificationContext);

      console.log(`📊 Query Classification Result:`, {
        query: query.substring(0, 100),
        isWritingRequest: writingClassification?.isWritingRequest,
        writingConfidence: writingClassification?.confidence,
        isCodeRelated: classification.isCodeRelated,
        codeConfidence: classification.confidence,
        primaryCategory: classification.primaryCategory,
        matchedKeywords: classification.matchedKeywords?.slice(0, 5),
      });

      // 📝 Route to Claude for WRITING requests (without search)
      if (
        writingClassification?.isWritingRequest &&
        writingClassification.confidence >= 0.4
      ) {
        console.log(
          `✍️ Routing to Claude Sonnet 4.5 for WRITING (confidence: ${writingClassification.confidence})`
        );
        console.log(`📌 Writing Classification:`, {
          hasWritingAction: writingClassification.hasWritingAction,
          contentTypes: writingClassification.contentTypeMatches,
          reasoning: writingClassification.reason,
        });

        try {
          // Initialize Claude service
          const claudeService = new ClaudeService();
          await claudeService.initialize();

          // Prepare messages for Claude
          const claudeMessages = [];

          // Add conversation history if available
          if (
            conversationHistoryWithMemory &&
            conversationHistoryWithMemory.length > 0
          ) {
            claudeMessages.push({
              role: 'user',
              content: `Previous conversation context:\n${conversationHistoryWithMemory}\n\nCurrent request: ${query}`,
            });
          } else {
            claudeMessages.push({
              role: 'user',
              content: query,
            });
          }

          // Call Claude with writing-optimized system prompt
          const writingSystemPrompt = `You are an expert writing assistant and content creator. Provide clear, engaging, and well-structured written content.

CORE PRINCIPLES:
- Write in a natural, flowing style appropriate for the context
- Match the tone and style to the requested format
- Structure content logically with proper paragraphs
- Use vivid language and engaging narrative when appropriate
- Maintain clarity and readability
- Adapt formality level to the context (professional, casual, creative, etc.)

WRITING TYPES YOU EXCEL AT:
- Essays and articles
- Blog posts and social media content
- Business documents (reports, proposals, emails)
- Creative writing (stories, poems, narratives)
- Marketing copy and descriptions
- Technical documentation (non-code)
- Letters and correspondence
- Summaries and reviews

RESPONSE FORMAT:
1. Deliver the requested content directly
2. If needed, provide brief context or explanation
3. Offer variations or alternatives when appropriate

QUALITY STANDARDS:
- Clear and coherent structure
- Appropriate tone and voice
- Engaging and purposeful language
- Proper grammar and punctuation
- Audience-appropriate vocabulary
- Well-organized paragraphs and flow

DO NOT:
- Write code or programming scripts (unless it's about explaining code in prose)
- Include search results or references (generate from your knowledge)
- Add unnecessary preambles (get straight to the content)`;

          console.log(`📤 Sending writing request to Claude...`);
          const startTime = Date.now();

          const claudeResponse = await claudeService.callClaude(
            claudeMessages,
            {
              system: writingSystemPrompt,
              maxTokens: config.claude.maxTokens || 4096,
              temperature: 0.7, // Higher temperature for more creative writing
            }
          );

          // Extract text content from Claude response
          const answerText = claudeResponse.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');

          const duration = Date.now() - startTime;
          console.log(`✅ Claude writing response received in ${duration}ms`);
          console.log(`📝 Response length: ${answerText.length} characters`);

          return {
            answer: answerText,
            modelUsed: 'claude-sonnet-4.5',
            classification: {
              isWritingRequest: true,
              confidence: writingClassification.confidence,
              type: 'writing',
            },
            references: [],
            searchMethod: 'claude_direct_writing',
            timestamp: new Date().toISOString(),
            responseTime: duration,
          };
        } catch (error) {
          console.error(`❌ Error routing to Claude for writing:`, error);
          console.log(`⚠️ Falling back to Gemini due to Claude error`);
          // Fall through to Gemini if Claude fails
        }
      }

      // 💻 Route to Claude for CODE requests (with search capability via ReAct)
      if (
        classification.isCodeRelated &&
        classification.confidence >= config.routing.codeQueryThreshold
      ) {
        console.log(
          `🚀 Routing to Claude Sonnet 4.5 (confidence: ${classification.confidence})`
        );
        console.log(`📌 Classification details:`, {
          primaryCategory: classification.primaryCategory,
          categories: classification.categories,
          reasoning: classification.reasoning,
        });

        try {
          // Initialize Claude service
          const claudeService = new ClaudeService();
          await claudeService.initialize();

          // Prepare messages for Claude
          const claudeMessages = [];

          // Add conversation history if available
          if (
            conversationHistoryWithMemory &&
            conversationHistoryWithMemory.length > 0
          ) {
            claudeMessages.push({
              role: 'user',
              content: `Previous conversation context:\n${conversationHistoryWithMemory}\n\nCurrent question: ${query}`,
            });
          } else {
            claudeMessages.push({
              role: 'user',
              content: query,
            });
          }

          // Call Claude with code-optimized system prompt
          const codeSystemPrompt = `You are an expert software engineer and programming assistant. Provide clear, accurate, and well-explained code solutions.

CORE PRINCIPLES:
- Write clean, production-ready code with proper error handling
- Include detailed comments explaining complex logic
- Follow language-specific best practices and conventions
- Provide working, tested code examples
- Explain your reasoning and approach

RESPONSE FORMAT:
1. Brief explanation of the approach
2. Complete, working code with comments
3. Key points and considerations
4. Potential gotchas or edge cases

QUALITY STANDARDS:
- Code should be copy-paste ready and functional
- Use modern language features and idioms
- Consider performance and scalability
- Include type hints/annotations where applicable
- Suggest testing approaches when relevant`;

          console.log(`📤 Sending query to Claude...`);
          const startTime = Date.now();

          const claudeResponse = await claudeService.callClaude(
            claudeMessages,
            {
              system: codeSystemPrompt,
              maxTokens: config.claude.maxTokens || 4096,
              temperature: config.claude.temperature || 0.7,
            }
          );

          // Extract text content from Claude response
          const answerText = claudeResponse.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');

          const duration = Date.now() - startTime;
          console.log(`✅ Claude response received in ${duration}ms`);
          console.log(`📝 Response length: ${answerText.length} characters`);

          return {
            answer: answerText,
            modelUsed: 'claude-sonnet-4.5',
            classification: {
              isCodeRelated: true,
              confidence: classification.confidence,
              primaryCategory: classification.primaryCategory,
            },
            references: [],
            searchMethod: 'claude_direct',
            timestamp: new Date().toISOString(),
            responseTime: duration,
          };
        } catch (error) {
          console.error(`❌ Error routing to Claude:`, error);
          console.log(`⚠️ Falling back to Gemini due to Claude error`);
          // Fall through to Gemini if Claude fails
        }
      } else {
        console.log(
          `📍 Routing to Gemini (not code-related or low confidence: ${classification.confidence})`
        );
        console.log(
          `📊 Classification: ${classification.primaryCategory} | Code-related: ${classification.isCodeRelated}`
        );
      }
    }

    // Build Massive financial context block if available
    let massiveContextBlock = '';
    if (isFinancialQuery && enhancedQuery !== query) {
      // The enhanced query IS the Massive context block - extract just the data section
      massiveContextBlock = `
═══════════════════════════════════════════════════════════════════════════════
REAL-TIME FINANCIAL DATA (Source: Massive.com — Authoritative Market Data Provider)
This data is LIVE and verified. You MUST use it as your primary data source for financial facts.
DO NOT ignore this data. DO NOT hallucinate prices. Use ONLY this data for market quotes.
═══════════════════════════════════════════════════════════════════════════════
${enhancedQuery.split('User Query:')[0]}
═══════════════════════════════════════════════════════════════════════════════
`;
      console.log(`💹 [Massive] Injecting live financial data into Gemini system context (${massiveContextBlock.length} chars)`);
    }

    const currentDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    const financialSystemAddendum = isFinancialQuery ? `

═══════════════════════════════════════════════════════════════════════════════
FINANCIAL DATA RULES (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════
✔ You have been provided REAL-TIME data from Massive.com above.
✔ ALWAYS cite [Source: Massive.com] at the top of your financial answer.
✔ Present prices, rates, and key numbers in **BOLD**.
✔ Use Markdown tables for options chains, comparison data, and multi-asset data.
✔ NEVER hallucinate prices or fabricate market data.
✔ If the data shows it's a fallback/simulation, say so clearly.
✔ For stocks: show price, bid/ask spread, volume.
✔ For crypto: show price and 24h change if available.
✔ For forex: show bid/ask and pip spread.
✔ For options: show strike, expiry, bid/ask, IV, delta.
✔ For indices: show level, daily change, % change.
✔ For macro: show latest CPI, yields, and Fed rate.
═══════════════════════════════════════════════════════════════════════════════
` : '';

    const systemPrompt = `${massiveContextBlock}You are an intelligent research assistant that provides CONCRETE, specific answers with complete details.${financialSystemAddendum}

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

CORE PRINCIPLE: PROVIDE DIRECT, ESSENTIAL INFORMATION ONLY
- For direct questions (sports schedules, dates, times, facts), provide ONLY the essential details
- NO unnecessary context or date qualifiers like "after [current date]" or "next game after today is"
- NO vague responses like "please refer to official schedule" or "search results indicate"
- If information is incomplete, state it simply: "The exact date and time is not scheduled"
- NEVER mention "search results" or reference the search process in your answer
- State facts directly and concisely - just the core information requested

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

STRUCTURED JSON FORMAT:
{
    "responseMessage": {
        "answer": "Direct answer with only essential details - no fluff or unnecessary context",
        "reference": [{
            "url": "source_url",
            "domain": "domain.com"
        }],
        "citations": [],
        "citationMetadata": null
    }
}

SEARCH STRATEGY:
- Use multiple specific search queries to find complete information
- Search for current schedules, dates, times, and specific details
- For sports: search team schedules, upcoming games, specific dates
- **IMPORTANT FOR SPORTS:** Use site-specific searches (site:nhl.com, site:espn.com) to get accurate data
- **VERIFY sports information** by running 2-3 different search queries with specific site restrictions
- Always verify information is current and accurate for ${currentDateString}
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

    // Initial messages for Gemini-based tool search
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `This is the current conversation history: ${conversationHistoryWithMemory}

Current question: ${finalQuery}

ANALYSIS REQUIRED: For business, investment, market, or analytical questions, conduct comprehensive research using search tools to gather:
- Current market data and trends (${currentDateString})
- Technical analysis and price predictions
- Expert opinions and recent reports from credible sources
- Financial metrics and performance data
- Risk factors and market conditions
- Sentiment analysis and market indicators
- IMPORTANT: Provide data-driven analysis WITH A CLEAR CONCLUSION, NOT disclaimers. Present findings objectively.
- Format: "Based on current market analysis from [sources], Bitcoin shows [data]... **Bottom Line: [Clear actionable synthesis of whether signals are bullish/bearish/neutral and why]**"
- Structure your answer: [Current Data] → [Expert Opinions] → [Technical Analysis] → **[Clear Conclusion/Recommendation]**

FOR SPORTS PREDICTIONS/ANALYSIS (e.g., "Who has a better chance to win?" or "Who will win?"):
- NEVER refuse to answer with "I cannot provide predictions"
- ALWAYS use search tools to gather data and provide analysis
- Search for:
  1. Current team/player statistics and performance (${currentDateString})
  2. Head-to-head records and recent matchups
  3. Current form, win/loss streaks, injuries
  4. Expert predictions and betting odds from sports analysts
  5. Home/away performance if applicable
- Provide data-driven analysis based on search results
- Structure: [Current Stats] → [Recent Performance] → [Expert Analysis] → **[Assessment/Prediction]**
- Example format: "Based on current data: [Team A] has [stats/record], while [Team B] has [stats/record]. Recent matchups show [data]. Expert analysis indicates [findings]. **Assessment:** [Team A/B] appears to have the edge because [2-3 specific data points]."
- Be clear this is analysis based on data, not a guarantee: "Based on available data..." or "Analysis suggests..."
- NEVER give generic refusals - ALWAYS search and provide analytical insights

For sports/event schedules, weather, news, or factual queries, use search tools to find:
- Current sports schedules and upcoming games. Current date is ${currentDateString}.
- For sports/games: MUST provide date + time + opponent (e.g., "November 7, 2025 at 7:00 PM against the New York Rangers")
- NEVER provide just a date alone for sports queries
- **CRITICAL FOR SPORTS QUERIES:** Use MULTIPLE specific search queries to verify information:
  1. Search: "site:nhl.com [team name] schedule 2025-2026" 
  2. Search: "site:espn.com [team name] schedule October 2025"
  3. Search: "[team name] official schedule [current month] 2025"
  4. Always cross-reference results from at least 2-3 sources before providing the answer
  5. Prioritize official sources (nhl.com, espn.com, team official website)
- Exact dates, times, opponents, and venues for events
- Current weather conditions and forecasts
- Latest news updates and factual information
- Session mostly requires up-to-date information
- Session declares like 2025/2026 season, next game, upcoming events.
- **CRITICAL FOR SPORTS:** Understand what user is asking:
  - "next HOME game" = ONLY games at team's home venue (filter out @ games)
  - "next AWAY game" = ONLY games at opponent's venue (look for @ indicator)
  - "next game" = closest upcoming game (home OR away)
  - Always return the CLOSEST game that matches the criteria after ${currentDateString}
- **SEARCH QUERY CONSTRUCTION FOR SPORTS:**
  - If user asks for HOME game: Include "home" keyword in search (e.g., "site:nhl.com Detroit Red Wings home schedule")
  - If user asks for AWAY game: Include "away" or "road" keyword in search (e.g., "site:nhl.com Detroit Red Wings away schedule")
  - Use multiple searches: official site, espn.com, nhl.com/mlb.com/nba.com depending on sport
- If asked for next game or schedule, provide exact date, time, opponent when available. Also search from ${currentDateString} onwards.
- For sports search on espn.com, nhl.com, www.viagogo.com, team site, or trusted sports sources
- Search top 20 results for best info
- **VERIFY accuracy by using multiple search queries with specific site restrictions**
- **DOUBLE-CHECK venue/location to ensure HOME vs AWAY is correct before answering**
- **PARSING RESULTS:** When you see search results, actively filter:
  - HOME game request → SKIP any result with "@" symbol or opponent's venue
  - AWAY game request → ONLY include results with "@" symbol or opponent's venue
  - If multiple games found, select the CLOSEST date after ${currentDateString}

SYNTHESIS: After gathering information, synthesize it into a clear, specific answer that includes all relevant details.

For investment/financial questions:
- Present current market analysis with specific data points
- Include expert opinions and predictions from credible sources
- Discuss technical indicators, trends, and price movements
- Analyze risks and opportunities based on current data
- Provide balanced perspective using multiple sources
- NO generic disclaimers - give informational analysis instead
- **CRITICAL: Provide a CLEAR CONCLUSION/SUMMARY at the end that synthesizes all the data into actionable insights**
- Example format: "Based on current market analysis (October 2025), Bitcoin is trading at $X with analysts predicting... Key factors include... **Conclusion: The data suggests [bullish/bearish/neutral] sentiment due to [key reasons]. Consider [specific actionable insights].**"
- End with a clear "**Bottom Line:**" or "**Key Takeaway:**" section that answers the user's question directly

For analytical/business questions, provide a detailed analysis covering:
- Market trends and data points
- Competitive landscape overview
- Strategic recommendations based on findings
- Risk assessment and mitigation strategies
- Cite all sources used in your analysis

Provide a well-researched, detailed response with proper source references. Use multiple search queries if needed to build a complete analysis.`,
      },
    ];

    const startTime = Date.now();
    const searchResult = await executeToolBasedConversation(messages, {
      userId,
      conversationId: state.conversationId,
      searchDepth: state.depth || 'standard',
      query: query,
      timezone: state.timezone || null,
      localDate: state.localDate || null,
      localTime: state.localTime || null,
    });
    const duration = Date.now() - startTime;
    console.log(`✅ Intelligent search process completed in ${duration}ms`);
    console.log(`Search Result:`, searchResult.responseMessage);

    // Return the properly structured response
    return {
      answer: searchResult?.responseMessage?.answer || '',
      reference: [
        ...(videoReferences || []),
        ...(searchResult?.responseMessage?.reference || [])
      ].slice(0, 5),
      citations: [
        ...(videoCitations || []),
        ...(searchResult?.responseMessage?.citations || [])
      ].map((cit, idx) => ({ ...cit, index: idx + 1 })).slice(0, 5),
      citationMetadata: {
        ...(searchResult?.responseMessage?.citationMetadata || {}),
        searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'intelligent_search',
      },
      searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'intelligent_search',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error in intelligent search:', error);
    return {
      answer:
        'I encountered an error while processing your search request. Please try again.',
      references: [],
      searchMethod: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};
