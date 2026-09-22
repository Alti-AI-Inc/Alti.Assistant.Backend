import { groqToolCall, groqStream } from '../../services/groq.client.js';
import { logger } from '../../../shared/logger.js';

// Import backend services
import { ExaSearchService } from '../ExaSearch/exaSearch.service.js';
import { ComposioService } from '../composio/composio.service.js';
import { VisualCrossingService } from '../visualcrossing/visualcrossing.service.js';
import { AviationStackService } from '../aviationstack/aviationstack.service.js';
import { CodexService } from '../codex/codex.service.js';
import { OpenClawService } from '../openclaw/openclaw.service.js';
import { ExploriumService } from '../explorium/explorium.service.js';
import { CoinApiService } from '../coinapi/coinapi.service.js';
import { MassiveService } from '../massive/massive.service.js';
import { ApiSportsService } from '../apisports/apisports.service.js';
import { PredictionDataService } from '../predictiondata/predictiondata.service.js';
import { NewsApiService } from '../newsapi/newsapi.service.js';

// Define schemas for the LLM
const tools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for real-time information, news, or facts using Exa.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, numResults: { type: 'number' } }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_code_sandbox',
      description: 'Write and execute JavaScript code in a secure V8 sandbox to solve math, process data, or verify logic.',
      parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_edge_command',
      description: 'Queue a bash script or system command to a remote OpenClaw Edge VM (e.g. vm-sovereign-01).',
      parameters: { type: 'object', properties: { machineId: { type: 'string' }, command: { type: 'string' }, payload: { type: 'object' } }, required: ['machineId', 'command', 'payload'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_app_action',
      description: 'Execute a third-party app action (e.g. GitHub, Slack, Linear) via Composio.',
      parameters: { type: 'object', properties: { tool_slug: { type: 'string' }, params: { type: 'object' } }, required: ['tool_slug', 'params'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get real-time weather forecasts for a specific location.',
      parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_flights',
      description: 'Get live flight tracking information by flight number.',
      parameters: { type: 'object', properties: { flight_number: { type: 'string' } }, required: ['flight_number'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'research_company',
      description: 'Get B2B intelligence and firmographics for a company using Explorium.',
      parameters: { type: 'object', properties: { company_name: { type: 'string' } }, required: ['company_name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Get live cryptocurrency prices and exchange rates.',
      parameters: { type: 'object', properties: { base_asset: { type: 'string', description: 'e.g. BTC' }, quote_asset: { type: 'string', description: 'e.g. USD' } }, required: ['base_asset', 'quote_asset'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_aggregates',
      description: 'Get stock market aggregates/candles for a ticker symbol via Massive.',
      parameters: { type: 'object', properties: { ticker: { type: 'string' }, multiplier: { type: 'number' }, timespan: { type: 'string', description: 'day, minute' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['ticker', 'multiplier', 'timespan', 'from', 'to'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sports_fixtures',
      description: 'Get live sports fixtures and scores.',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_prediction_markets',
      description: 'Get live prediction market odds from Polymarket/Kalshi.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_news',
      description: 'Get breaking news articles for a given topic.',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }
    }
  }
];

export const AgentService = {
  /**
   * Executes a tool based on the LLM's function call.
   */
  async executeTool(name, args) {
    try {
      logger.info(`[AgentService] Executing tool: ${name} with args:`, args);
      switch (name) {
        case 'execute_edge_command': {
          const res = await OpenClawService.queueEdgeCommand(args.machineId, args.command, args.payload);
          return {
            output: `Command successfully queued to edge node ${args.machineId}. Command ID: ${res.commandId}. Status: ${res.status}. Note: Execution is async, awaiting results via polling.`,
            references: [{ title: `Edge Command: ${res.commandId}`, url: 'local://openclaw', snippet: `Queued ${args.command} to ${args.machineId}`, source: 'OpenClaw Edge Fleet' }]
          };
        }
        case 'execute_code_sandbox': {
          const res = await CodexService.executeCode({ code: args.code });
          return {
            output: `Logs:\n${res.logs.join('\n')}\nReturn:\n${res.result}\nError:\n${res.error || 'None'}`,
            references: [{ title: 'Code Execution', url: 'local://open-codex', snippet: 'Sandboxed Open Codex Execution', source: 'Open Codex Sandbox' }]
          };
        }
        case 'web_search': {
          const res = await ExaSearchService.searchDirectly(args.query, { numResults: args.numResults || 3 });
          const results = res?.results || [];
          return {
            output: results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSummary: ${r.summary || r.text?.slice(0, 300)}`).join('\n\n'),
            references: results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.summary || r.text?.slice(0, 150),
              source: 'Exa Neural Search'
            }))
          };
        }
        case 'trigger_app_action': {
          const res = await ComposioService.executeTool(args.tool_slug, args.params, 'system-session');
          return { output: JSON.stringify(res), references: [] };
        }
        case 'get_weather': {
          const wx = await VisualCrossingService.getForecast(args.location);
          return {
            output: JSON.stringify({ current: wx?.currentConditions, days: wx?.days?.slice(0, 3) }),
            references: [{ title: `Weather for ${args.location}`, url: 'https://visualcrossing.com', snippet: 'Live weather data', source: 'Visual Crossing' }]
          };
        }
        case 'get_flights': {
          const flight = await AviationStackService.getFlightByNumber(args.flight_number);
          return {
            output: JSON.stringify(flight),
            references: [{ title: `Flight ${args.flight_number}`, url: 'https://aviationstack.com', snippet: 'Live flight tracking', source: 'AviationStack' }]
          };
        }
        case 'research_company': {
          const res = await ExploriumService.researchBusiness({ query: args.company_name });
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.company_name} Intelligence`, url: 'https://explorium.ai', snippet: 'B2B Firmographics', source: 'Explorium AgentSource' }]
          };
        }
        case 'get_crypto_price': {
          const res = await CoinApiService.getExchangeRate(args.base_asset, args.quote_asset);
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.base_asset}/${args.quote_asset} Rate`, url: 'https://coinapi.io', snippet: 'Live Crypto Price', source: 'CoinAPI' }]
          };
        }
        case 'get_stock_aggregates': {
          const res = await MassiveService.getStockAggregates(args.ticker, args.multiplier, args.timespan, args.from, args.to);
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.ticker} Stock Data`, url: 'https://massive.com', snippet: 'Live Market Data', source: 'Massive' }]
          };
        }
        case 'get_sports_fixtures': {
          const res = await ApiSportsService.getFixtures({ date: args.date });
          return {
            output: JSON.stringify(res),
            references: [{ title: `Sports Fixtures ${args.date}`, url: 'https://api-sports.io', snippet: 'Live Sports Scores', source: 'API-Sports' }]
          };
        }
        case 'get_prediction_markets': {
          const res = await PredictionDataService.searchMarkets(args.query);
          return {
            output: JSON.stringify(res),
            references: [{ title: `Prediction Markets for ${args.query}`, url: 'https://polymarket.com', snippet: 'Live Odds', source: 'PredictionData' }]
          };
        }
        case 'get_latest_news': {
          const res = await NewsApiService.getTopHeadlines({ q: args.q });
          return {
            output: JSON.stringify(res),
            references: [{ title: `News: ${args.q}`, url: 'https://newsapi.ai', snippet: 'Breaking News', source: 'NewsAPI' }]
          };
        }
        default:
          return { output: `Error: Tool ${name} not recognized.`, references: [] };
      }
    } catch (error) {
      logger.error(`[AgentService] Tool ${name} failed: ${error.message}`);
      return { output: `Tool execution failed: ${error.message}`, references: [] };
    }
  },

  /**
   * Runs the autonomous Agentic ReAct loop.
   * Yields metadata and text chunks for the SSE stream.
   * @param {Array} initialMessages - Conversation history
   * @param {Object} options - Model config
   * @returns {AsyncGenerator} 
   */
  async *runAgentStream(initialMessages, options = {}) {
    const messages = [...initialMessages];
    const maxLoops = 5;
    let loopCount = 0;
    const allReferences = [];

    while (loopCount < maxLoops) {
      loopCount++;
      logger.info(`[AgentService] Starting loop ${loopCount}...`);
      
      // Call LLM
      const response = await groqToolCall(messages, tools, options);
      const responseMessage = response.choices[0]?.message;

      if (!responseMessage) {
        yield { type: 'text', content: '\n\n*Error: LLM returned empty response.*' };
        break;
      }

      // If there are tool calls, execute them
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage); // append assistant's tool calls
        
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          let functionArgs;
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            functionArgs = {};
          }

          const { output, references } = await this.executeTool(functionName, functionArgs);
          
          if (references && references.length > 0) {
            allReferences.push(...references);
            // Yield metadata to frontend immediately so citations show up as they are found
            yield { type: 'metadata', references: allReferences };
          }

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: output || 'Success'
          });
        }
      } else {
        // No tool calls means the agent is ready to stream the final answer.
        // We will discard the text it just generated and re-run as a stream for UI UX.
        // Or we can just yield the text if we don't care about streaming character-by-character.
        // But users love the typewriter effect. We'll run groqStream to generate the final response.
        
        logger.info(`[AgentService] Loop finished, streaming final answer...`);
        const stream = await groqStream(messages, options);
        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            yield { type: 'text', content: text };
          }
        }
        break;
      }
    }

    if (loopCount >= maxLoops) {
      yield { type: 'text', content: '\n\n*Error: Agent reached maximum recursion depth.*' };
    }
  },

  /**
   * Main ReAct Agent Loop (Non-Streaming/JSON Mode)
   */
  async runAgentJson(initialMessages, options = {}) {
    const maxSteps = options.maxSteps || 5;
    const model = options.model || 'gpt-oss-120b';
    const temperature = options.temperature || 0.1;
    let messages = [...initialMessages];
    let stepCount = 0;
    const allReferences = [];

    try {
      while (stepCount < maxSteps) {
        stepCount++;
        const response = await groqToolCall(messages, tools, { model, temperature });
        const toolCalls = response.choices?.[0]?.message?.tool_calls;
        
        if (!toolCalls || toolCalls.length === 0) break;

        const messageWithTools = response.choices[0].message;
        messages.push(messageWithTools);

        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          let functionArgs = {};
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // Ignore JSON parse errors
          }

          const result = await this.executeTool(name, functionArgs);
          
          if (result.references?.length > 0) {
            allReferences.push(...result.references);
          }

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: name,
            content: result.output,
          });
        }
      }

      // Final generation (non-streaming)
      const finalRes = await groqToolCall(messages, undefined, { model, temperature });
      return {
        reply: finalRes.choices?.[0]?.message?.content || '',
        references: allReferences,
        steps: stepCount
      };
    } catch (err) {
      logger.error(`[AgentService] Fatal error: ${err.message}`);
      throw err;
    }
  }
};

export default AgentService;
