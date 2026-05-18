import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { DynamicTool } from '@langchain/core/tools';
import { WebBrowser } from 'langchain/tools/webbrowser';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import config from '../../../../../config/index.js';
import {
  selectModelSmart,
  gemini2_5Flash,
  gemini3ProPreview,
} from './geminiService.js';
import { openMemoryClient } from '../../../shared/openMemoryClient.js';

/**
 * ReAct Agent Service
 * Executes tool-based conversation with reasoning and action cycles
 * NOW WITH SMART MODEL SELECTION
 */

/**
 * Executes a ReAct (Reasoning + Acting) agent conversation with tool calls
 * @param {Array} messages - Array of conversation messages
 * @param {Object} options - Additional options including userId and query context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeToolBasedConversation(messages, options = {}) {
  const resolvedUserId =
    options?.userId || options?.authUserId || options?.user?.id || null;

  // Extract query from messages for smart model selection
  const userMessages = messages.filter((m) => m.role === 'user');
  const currentQuery =
    userMessages.length > 0
      ? userMessages[userMessages.length - 1].content
      : '';

  // SMART MODEL SELECTION based on query
  const conversationHistory = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
  const selectedLLM = selectModelSmart(currentQuery, {
    conversationHistory,
    searchDepth: options.searchDepth || 'standard',
    previousToolCalls: options.previousToolCalls || 0,
  });

  console.log(
    '🤖 ReactAgent using selected model for tool-based conversation',
    selectModelSmart
  );

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const tools = [
    new GoogleCustomSearch({
      apiKey: config.google_search_api_key,
      googleCSEId: config.google_engine_id,
    }),
    new WebBrowser({
      model: selectedLLM, // Use selected model
      embeddings: new GoogleGenerativeAIEmbeddings({
        apiKey: config.gemini_secret_key,
      }),
      textSplitter,
    }),
  ];

  if (openMemoryClient?.enabled) {
    const openMemoryTool = new DynamicTool({
      name: 'openmemory-query',
      description:
        'Retrieve long-term, user-scoped memories. Input must be JSON with {"query":"...","userId":"...","k":5,"filters":{}}.',
      async func(rawInput) {
        if (!openMemoryClient.enabled) {
          return JSON.stringify({ error: 'OpenMemory disabled' });
        }

        let payload = {};
        if (typeof rawInput === 'string') {
          const trimmed = rawInput.trim();
          if (trimmed.startsWith('{')) {
            try {
              payload = JSON.parse(trimmed);
            } catch (err) {
              console.warn(
                '⚠️ Failed to parse OpenMemory tool input, falling back to raw string',
                err?.message || err
              );
              payload = { query: rawInput };
            }
          } else {
            payload = { query: rawInput };
          }
        } else if (typeof rawInput === 'object' && rawInput !== null) {
          payload = rawInput;
        }

        const query = payload.query || payload.input || '';
        const userId = payload.userId || resolvedUserId;
        const topK = payload.k || config.openMemory?.defaultTopK || 5;

        if (!query) {
          return JSON.stringify({ error: 'Missing query for OpenMemory tool' });
        }

        if (!userId) {
          return JSON.stringify({
            error: 'Missing userId for OpenMemory tool',
          });
        }

        try {
          const matches = await openMemoryClient.queryMemories({
            query,
            userId,
            k: topK,
            filters: payload.filters || {},
          });

          if (!Array.isArray(matches) || matches.length === 0) {
            return JSON.stringify([]);
          }

          if (payload.reinforce !== false) {
            const reinforcePromises = matches
              .filter((match) => match?.id)
              .map((match) =>
                openMemoryClient.reinforceMemory(match.id).catch(() => null)
              );
            await Promise.allSettled(reinforcePromises);
          }

          const response = matches.map((match) => ({
            id: match?.id,
            content: match?.content,
            score: match?.score,
            sector:
              match?.primary_sector || match?.metadata?.sector || 'semantic',
            metadata: match?.metadata || {},
            createdAt: match?.created_at || match?.createdAt,
          }));

          return JSON.stringify(response);
        } catch (error) {
          console.warn('⚠️ OpenMemory tool query failed', error);
          return JSON.stringify({
            error: 'OpenMemory query failed',
            details: error.message,
          });
        }
      },
    });

    tools.push(openMemoryTool);
  }

  const toolBasedLlm = selectedLLM.bindTools(tools); // Use selected model

  // Add ReAct agent instructions to the system message
  const openMemoryInstruction = openMemoryClient?.enabled
    ? `

OPENMEMORY MEMORY ACCESS:
- Use the "openmemory-query" tool for user-specific recall.
- ALWAYS pass JSON with "query" and "userId" (use "${resolvedUserId || '<provide_user_id>'}" if available).
- Use this before web search when recalling prior user answers, uploaded docs, or preferences.`
    : '';

  const reactSystemPrompt = `${messages[0].content}

REACT AGENT MODE - REASONING AND ACTION:
You are now operating as a ReAct (Reasoning and Action) agent. This means you should:

1. **THINK**: Reason about what information you need to answer the user's question
2. **ACT**: Use tools to gather that information
3. **OBSERVE**: Analyze the results from your tools
4. **REASON**: Decide if you have enough information or need more
5. **REPEAT**: Continue until you have sufficient information to provide a complete answer

REASONING PROCESS FOR EACH TOOL CALL:
Before using any tool, internally ask yourself:
- What specific information do I need?
- Which tool is best suited for this?
- What search query will give me the most accurate results?
- Do I need to verify this information with multiple searches?

FOR SPORTS QUERIES - CRITICAL UNDERSTANDING:
**UNDERSTAND THE USER'S SPECIFIC REQUEST:**
- "next HOME game" = game played at team's home arena (look for @ indicators or venue)
- "next AWAY game" = game played at opponent's arena
- "next game" (no qualifier) = closest upcoming game regardless of location
- HOME games are typically indicated by: team name listed first, or venue is team's home arena
- AWAY games are typically indicated by: @ symbol, or "at [opponent's venue]"

**EXAMPLE: "When is the next Detroit Red Wings home game?" (Asked on Oct 23, 2025):**
- THOUGHT: "User specifically wants HOME game. I need Detroit Red Wings schedule after Oct 23, 2025, filtering for HOME games only"
- ACTION 1: Search "site:nhl.com Detroit Red Wings home schedule 2025-2026 after October"
- OBSERVE: Look for games at Little Caesars Arena (home venue) or without @ symbol
- FILTER: Only consider games WHERE Detroit is the home team (not @ opponent)
- ACTION 2: Search "site:espn.com Detroit Red Wings home games October November 2025"
- OBSERVE: Cross-reference - ensure it's a HOME game, not away
- REASON: "Is this definitely a HOME game? Is this the CLOSEST upcoming home game after Oct 23?"
- VERIFY: Check venue or @ indicator to confirm it's at Detroit's home arena
- FINAL: Provide the CLOSEST home game with date + time + opponent

**FILTERING RULES:**
1. If user asks for "home game" - ONLY return games at team's home venue
2. If user asks for "away game" - ONLY return games at opponent's venue (with @)
3. If user asks for "next game" - return the CLOSEST upcoming game (home or away)
4. Always return the CLOSEST matching game after the current date
5. Double-check the venue/location before finalizing answer

**HOW TO IDENTIFY HOME VS AWAY GAMES IN SEARCH RESULTS:**
When analyzing search results, look for these indicators:

HOME GAME INDICATORS:
✓ NO "@" symbol before opponent name
✓ Format: "Team vs Opponent" or "Team - Opponent"
✓ Venue matches team's home arena (e.g., Little Caesars Arena for Detroit Red Wings)
✓ Listed as "HOME" in schedule
✓ Team name appears first in matchup

AWAY GAME INDICATORS:
✗ "@" symbol present (e.g., "@ New York Rangers")
✗ Format: "Team @ Opponent" or "Team at Opponent"
✗ Venue is opponent's arena (e.g., game at Madison Square Garden when it's not your team's home)
✗ Listed as "AWAY" or "ROAD" in schedule
✗ Opponent name appears first with "vs" (e.g., "Rangers vs Red Wings" = away for Red Wings)

CRITICAL: When user asks for HOME game, you MUST:
1. Search specifically for "home game" or "home schedule"
2. Parse results and REJECT any games with @ symbol
3. Verify venue matches team's home arena
4. If first result is away game, continue searching for home game
5. NEVER return an away game when user asks for home game

**FINAL VERIFICATION CHECKLIST (Before providing answer):**
For HOME game queries, ask yourself:
☐ Did I search with "home" keyword explicitly?
☐ Does the result have NO "@" symbol?
☐ Is the venue the team's home arena?
☐ Is this the CLOSEST home game after the current date?
☐ Did I verify with at least 2 sources?

For AWAY game queries, ask yourself:
☐ Did I search with "away" or "road" keyword?
☐ Does the result have "@" symbol OR opponent's venue?
☐ Is this the CLOSEST away game after the current date?
☐ Did I verify with at least 2 sources?

If ANY checkbox is NO, continue searching. Do NOT provide answer until ALL checkboxes are YES.

FOR INVESTMENT QUERIES (e.g., "Should I invest in Bitcoin?"):
- THOUGHT: "I need current price, trends, expert predictions, and risk factors"
- ACTION 1: Search for current Bitcoin price and technical analysis
- OBSERVE: Note current price and trend indicators
- ACTION 2: Search for expert predictions for late 2025
- OBSERVE: Gather price predictions and timeframes
- ACTION 3: Search for current market sentiment and risks
- OBSERVE: Understand market conditions and risks
- REASON: Can I synthesize this into a clear conclusion?
- FINAL: Provide data-driven analysis with clear bottom line

FOR SPORTS PREDICTIONS (e.g., "Who has a better chance to win the [Team A] vs [Team B] game?"):
- THOUGHT: "User wants prediction. I need current stats, recent form, head-to-head, and expert analysis"
- ACTION 1: Search "Team A vs Team B current statistics 2025 season"
- OBSERVE: Gather win/loss records, scoring averages, defensive stats
- ACTION 2: Search "Team A vs Team B head to head history recent games"
- OBSERVE: Analyze recent matchup results and patterns
- ACTION 3: Search "Team A vs Team B expert predictions betting odds"
- OBSERVE: Collect expert opinions and betting line insights
- ACTION 4: Search "Team A Team B injuries lineup news October 2025"
- OBSERVE: Check for key player injuries or absences
- REASON: "Do I have enough data to provide an informed analysis?"
- SYNTHESIZE: Compare all data points (stats, form, H2H, expert views, injuries)
- FINAL: Provide analysis with clear assessment - "Based on available data: [Team A] appears to have the edge because [specific reasons with data]"
- NEVER say "I cannot predict" - ALWAYS provide data-driven analysis

CRITICAL REASONING GUIDELINES:${openMemoryInstruction}
- Always use MULTIPLE searches for verification, especially for sports schedules
- Use site-specific searches (site:nhl.com, site:espn.com) for authoritative sources
- If information conflicts between sources, continue searching until clarity
- Don't stop at first result - verify with 2-3 sources
- Reason about whether you have COMPLETE information before answering`;

  // Update the first message with ReAct instructions
  const reactMessages = [
    {
      role: 'system',
      content: reactSystemPrompt,
    },
    ...messages.slice(1),
  ];

  let currentMessages = [...reactMessages];
  let iterationCount = 0;
  const maxIterations = 8; // Increased for ReAct reasoning cycles
  let usedUrls = new Set(); // Track URLs used for references
  let reasoningLog = []; // Track reasoning steps

  while (iterationCount < maxIterations) {
    iterationCount++;
    console.log(
      `\n=== ReAct Agent Iteration ${iterationCount}/${maxIterations} ===`
    );

    const res = await toolBasedLlm.invoke(currentMessages);
    console.log('Response tool_calls:', res.tool_calls?.length || 0);

    console.log('🧠 ReAct THINK:', res.content);

    // Log reasoning if present in the response
    if (
      res.content &&
      typeof res.content === 'string' &&
      res.content.length > 0
    ) {
      console.log(`💭 Agent Reasoning: ${res.content.substring(0, 200)}...`);
      reasoningLog.push({
        iteration: iterationCount,
        reasoning: res.content,
        toolCalls: res.tool_calls?.length || 0,
      });
    }

    // If no tool calls, we have a final answer
    if (!res.tool_calls || res.tool_calls.length === 0) {
      console.log('=== Final Answer ===');
      console.log(res.content);

      // Format the response in the requested structure
      // Limit references to 3-5 items
      const allReferences = Array.from(usedUrls).map((url) => {
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          return { url, domain };
        } catch {
          return { url, domain: 'unknown' };
        }
      });

      // Take only first 5 references
      const references = allReferences.slice(0, 5);

      const citations = references.map((ref, index) => ({
        index: index + 1,
        url: ref.url,
        domain: ref.domain,
      }));

      // Clean the answer by removing URLs and source sections
      // Handle both string and array content (concatenate all text blocks if array)
      let cleanAnswer;
      if (typeof res.content === 'string') {
        cleanAnswer = res.content;
      } else if (Array.isArray(res.content)) {
        // Concatenate all text blocks from the array
        cleanAnswer = res.content
          .filter((block) => block.type === 'text' && block.text)
          .map((block) => block.text)
          .join('');
      } else {
        cleanAnswer = 'No answer provided';
      }

      // Check if the answer is already in JSON format and extract just the answer
      try {
        // Try to parse as direct JSON first
        const directJson = JSON.parse(cleanAnswer);
        if (directJson.responseMessage && directJson.responseMessage.answer) {
          cleanAnswer = directJson.responseMessage.answer;
        }
      } catch (e) {
        // Try to find JSON in code blocks
        try {
          const jsonMatch = cleanAnswer.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            const jsonContent = JSON.parse(jsonMatch[1]);
            if (
              jsonContent.responseMessage &&
              jsonContent.responseMessage.answer
            ) {
              cleanAnswer = jsonContent.responseMessage.answer;
            }
          }
        } catch (e2) {
          // If parsing fails, continue with original answer
        }
      }

      // Remove URLs from the answer
      cleanAnswer = cleanAnswer.replace(/https?:\/\/[^\s\n\r]*/g, '');

      // Remove **Sources:** section and everything after it
      cleanAnswer = cleanAnswer.replace(/\*\*Sources?\*\*:[\s\S]*$/, '');

      // Remove bullet point lists that contain URLs
      cleanAnswer = cleanAnswer.replace(/\*\s+[^\n]*https?:\/\/[^\n]*/g, '');

      // Clean up extra whitespace and newlines
      cleanAnswer = cleanAnswer.replace(/\n{3,}/g, '\n\n').trim();

      const formattedResponse = {
        responseMessage: {
          answer: cleanAnswer,
          reference: references,
          citations: citations,
          citationMetadata: null,
        },
      };

      console.log('\n=== ReAct Agent Summary ===');
      console.log(`Total iterations: ${iterationCount}`);
      console.log(
        `Total tool calls: ${reasoningLog.reduce((sum, log) => sum + log.toolCalls, 0)}`
      );
      console.log(`Sources verified: ${usedUrls.size}`);
      console.log('\n=== Formatted Response ===');
      console.log(JSON.stringify(formattedResponse, null, 2));
      return formattedResponse;
    }

    // Add the assistant's message with tool calls
    currentMessages.push({
      role: 'assistant',
      content: res.content,
      tool_calls: res.tool_calls,
    });

    // Execute each tool call and add results
    for (const toolCall of res.tool_calls) {
      console.log(`🔧 ReAct ACTION: Executing tool: ${toolCall.name}`);
      console.log(`📝 Search Query:`, toolCall.args.input);

      try {
        // Execute the tool based on its name
        let toolResult;
        if (toolCall.name === 'google-custom-search') {
          const googleSearch = new GoogleCustomSearch({
            apiKey: config.google_search_api_key,
            googleCSEId: config.google_engine_id,
          });

          const startTime = Date.now();
          toolResult = await googleSearch.invoke(toolCall.args.input);
          const duration = Date.now() - startTime;

          console.log(`✅ Search completed in ${duration}ms`);

          // Extract URLs from Google search results for references
          try {
            const searchResults = JSON.parse(toolResult);
            if (Array.isArray(searchResults)) {
              console.log(
                `📊 ReAct OBSERVE: Found ${searchResults.length} search results`
              );
              searchResults.forEach((result) => {
                if (result.link) {
                  usedUrls.add(result.link);
                }
              });
            }
          } catch (e) {
            // If not JSON, try to extract URLs with regex
            const urlRegex = /https?:\/\/[^\s"]+/g;
            const urls = toolResult.match(urlRegex) || [];
            console.log(
              `📊 ReAct OBSERVE: Extracted ${urls.length} URLs from results`
            );
            urls.forEach((url) => usedUrls.add(url));
          }
        } else if (toolCall.name === 'web-browser') {
          const browser = new WebBrowser({
            model: selectedLLM, // Use selected model
            embeddings: new GoogleGenerativeAIEmbeddings({
              apiKey: config.gemini_secret_key,
            }),
            textSplitter,
          });
          toolResult = await browser.invoke(toolCall.args.input);

          // Extract URL from web browser input
          const urlMatch = toolCall.args.input.match(/https?:\/\/[^\s,"]+/);
          if (urlMatch) {
            usedUrls.add(urlMatch[0]);
          }
        }

        console.log(
          `Tool result preview:`,
          toolResult.substring(0, 400) + '...'
        );

        // Add tool result to messages
        currentMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error.message);
        currentMessages.push({
          role: 'tool',
          content: `Error: ${error.message}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }
  }

  console.log('Max iterations reached, returning last result');

  // If we reach max iterations, still format the response
  // Limit references to 3-5 items
  const allReferences = Array.from(usedUrls).map((url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return { url, domain };
    } catch {
      return { url, domain: 'unknown' };
    }
  });

  // Take only first 5 references
  const references = allReferences.slice(0, 5);

  const citations = references.map((ref, index) => ({
    index: index + 1,
    url: ref.url,
    domain: ref.domain,
  }));

  const formattedResponse = {
    responseMessage: {
      answer: 'Max iterations reached without final answer',
      reference: references,
      citations: citations,
      citationMetadata: null,
    },
  };

  console.log('\n=== Formatted Response (Max Iterations) ===');
  console.log(JSON.stringify(formattedResponse, null, 2));
  return formattedResponse;
}
