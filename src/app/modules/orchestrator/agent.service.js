import { groqToolCall, groqStream } from '../../services/groq.client.js';
import { logger } from '../../../shared/logger.js';

// Import backend services
import { ExaSearchService } from '../ExaSearch/exaSearch.service.js';
import { ComposioService } from '../composio/composio.service.js';
import { VisualCrossingService } from '../visualcrossing/visualcrossing.service.js';
import { AviationStackService } from '../aviationstack/aviationstack.service.js';
import { CodexService } from '../codex/codex.service.js';

// Define schemas for the LLM
const tools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for real-time information, news, or facts using Exa.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          numResults: { type: 'number', description: 'Number of results to fetch (default: 3)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_code_sandbox',
      description: 'Write and execute JavaScript code in a secure V8 sandbox to solve math, process data, or verify logic.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The JavaScript code to execute. Must be self-contained. Use console.log() to print the result.' }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_app_action',
      description: 'Execute a third-party app action (e.g. GitHub, Slack, Linear) via Composio.',
      parameters: {
        type: 'object',
        properties: {
          tool_slug: { type: 'string', description: 'The exact slug of the tool to execute' },
          params: { type: 'object', description: 'A JSON object containing the parameters required for the tool' }
        },
        required: ['tool_slug', 'params']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get real-time weather forecasts for a specific location.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City, state, or zip code' }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_flights',
      description: 'Get live flight tracking information by flight number.',
      parameters: {
        type: 'object',
        properties: {
          flight_number: { type: 'string', description: 'The flight number (e.g. AA123)' }
        },
        required: ['flight_number']
      }
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
  }
};

export default AgentService;
