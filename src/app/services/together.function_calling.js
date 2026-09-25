/**
 * Aphura Sovereign Together.ai Function Calling Suite Service
 * Complete Implementation of Together AI Function Calling across 5 Core Domains:
 * 
 * 1. Overview & Architecture:  https://docs.together.ai/docs/inference/function-calling/overview
 *    - Model/Client request cycle, 7 core patterns, supported models catalog
 * 2. Single Function Calling:   https://docs.together.ai/docs/inference/function-calling/single-call
 *    - Simple (one tool, one call), streaming delta.tool_calls, multiple function selection, tool_choice modes
 * 3. Parallel Function Calling: https://docs.together.ai/docs/inference/function-calling/parallel
 *    - Same function multi-call parallelization, heterogeneous multi-tool parallelization
 * 4. Agentic Function Calling:  https://docs.together.ai/docs/inference/function-calling/agentic
 *    - Multi-step loops (in-turn chained completions), multi-turn context retention across conversation turns
 * 5. Best Practices & Hardening: https://docs.together.ai/docs/inference/function-calling/best-practices
 *    - Spec-grade descriptions, unrepresentable invalid states, strict schemas, soft limit < 20 tools, error recovery
 * 
 * License: MIT
 */

import { llmChat } from './llm.client.js';

// ── 1. Supported Models & Patterns Catalog ──────────────────────────────────

export const FUNCTION_CALLING_MODELS = [
  { id: 'zai-org/GLM-5.3', name: 'GLM-5.3', status: 'recommended', context: '128K', description: 'Recommended production function calling model.' },
  { id: 'Qwen/Qwen3.5-9B', name: 'Qwen 3.5 9B', status: 'recommended_lightweight', context: '262K', description: 'Fast, cost-efficient function calling for high-volume pipelines.' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct Turbo', status: 'supported', context: '128K', description: 'Enterprise-grade reasoning and schema compliance.' },
  { id: 'deepseek-ai/DeepSeek-V4-Pro-0813', name: 'DeepSeek V4 Pro', status: 'supported', context: '1M', description: 'Massive 1M context with structured agentic function calling.' },
  { id: 'moonshotai/Kimi-K3', name: 'Kimi K3', status: 'supported', context: '1M', description: 'Long-horizon multi-turn tool calling and reasoning.' },
];

export const FUNCTION_CALLING_PATTERNS = [
  {
    name: 'Simple',
    description: 'One function provided, one call executed per turn.',
    use_cases: ['Basic utilities', 'Simple status queries', 'Single lookup APIs'],
    docs_anchor: '#simple-function-calling',
  },
  {
    name: 'Multiple',
    description: 'Many functions provided; model selects the single optimal tool based on intent.',
    use_cases: ['Disambiguation between stock, weather, or calendar', 'Multi-skill assistants'],
    docs_anchor: '#multiple-function-calling',
  },
  {
    name: 'Parallel',
    description: 'Same function invoked multiple times concurrently with distinct parameters.',
    use_cases: ['Batch weather queries for 3 cities', 'Multi-ticker financial analysis'],
    docs_anchor: '#parallel-function-calling',
  },
  {
    name: 'Parallel multiple',
    description: 'Multiple heterogeneous functions invoked concurrently in a single response.',
    use_cases: ['Cross-domain requests requiring both weather and stock queries simultaneously'],
    docs_anchor: '#parallel-multiple-function-calling',
  },
  {
    name: 'Multi-step',
    description: 'Sequential tool calling chained inside one conversation turn until completion.',
    use_cases: ['Data processing pipelines', 'Calculations requiring intermediary verification'],
    docs_anchor: '#multi-step-function-calling',
  },
  {
    name: 'Multi-turn',
    description: 'Conversational context and tool history preserved across persistent dialog turns.',
    use_cases: ['Autonomous customer support', 'Interactive travel planners with state memory'],
    docs_anchor: '#multi-turn-function-calling',
  },
  {
    name: 'Vision',
    description: 'Tool calling paired with multimodal image inputs on vision-language models.',
    use_cases: ['Extracting invoice tables from images', 'Visual chart inspection and API updates'],
    docs_anchor: '/docs/inference/vision/function-calling',
  },
];

export function getFunctionCallingOverview() {
  return {
    success: true,
    title: 'Together AI Function Calling Patterns Overview',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/overview',
    recommended_model: 'zai-org/GLM-5.3',
    supported_models: FUNCTION_CALLING_MODELS,
    patterns: FUNCTION_CALLING_PATTERNS,
    flow: [
      { step: 1, actor: 'Application', action: 'Sends messages array and tools array to chat completions endpoint.' },
      { step: 2, actor: 'Model', action: 'Evaluates prompt, produces finish_reason: "tool_calls" and tool_calls array.' },
      { step: 3, actor: 'Application', action: 'Appends assistant message, executes tools locally or via APIs.' },
      { step: 4, actor: 'Application', action: 'Appends role: "tool" responses referencing corresponding tool_call_id.' },
      { step: 5, actor: 'Model', action: 'Synthesizes final natural language response or requests further tool calls.' },
    ],
    infrastructure: 'Liberty Center One & Together.ai Sovereign Fleet',
  };
}

// ── 2. Single Function Calling & Tool Choice ────────────────────────────────

export const TOOL_CHOICE_OPTIONS = {
  auto: {
    value: 'auto',
    description: 'Default. The model decides autonomously whether to invoke a function or reply with text.',
  },
  none: {
    value: 'none',
    description: 'The model is prohibited from calling functions and generates text responses only.',
  },
  required: {
    value: 'required',
    description: 'Forces the model to call at least one function from the provided tools list.',
  },
  specific_tool: {
    value: { type: 'function', function: { name: '<function_name>' } },
    description: 'Forces the model to call the exact specified function regardless of user phrasing.',
  },
};

export function getSingleCallDocs() {
  return {
    success: true,
    title: 'Single Function Calling Reference',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/single-call',
    modes: ['Simple (1 tool, 1 call)', 'Multiple (many tools, 1 call)', 'Streaming delta.tool_calls'],
    tool_choice_options: TOOL_CHOICE_OPTIONS,
    critical_notes: [
      'Tool calls land strictly in message.tool_calls, NEVER in message.content.',
      'message.content is often null or empty string during tool calling turns.',
      'Streaming responses emit partial tool calls across delta.tool_calls chunks with incremental arguments.',
      'Always read the function call from message.tool_calls[0].function.name and .arguments.',
    ],
    example_schema: {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'The city and state, e.g. San Francisco, CA' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[{"role": "user", "content": "What is the current temperature of New York?"}],
    tools=tools,
    tool_choice="auto"
)
tool_calls = response.choices[0].message.tool_calls`,
      typescript: `import Together from "together-ai";
const client = new Together();

const response = await client.chat.completions.create({
  model: "Qwen/Qwen3.5-9B",
  messages: [{ role: "user", content: "What is the current temperature of New York?" }],
  tools,
  tool_choice: "auto",
});
const toolCalls = response.choices[0].message?.tool_calls;`,
    },
  };
}

// ── 3. Parallel Function Calling ────────────────────────────────────────────

export function getParallelCallDocs() {
  return {
    success: true,
    title: 'Parallel Function Calling Reference',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/parallel',
    variants: [
      {
        name: 'Homogeneous Parallel',
        description: 'Single tool called N times in one response with distinct parameter sets.',
        example: 'Prompt: "Weather in NYC, SF, and Chicago?" -> 3 get_current_weather tool calls.',
      },
      {
        name: 'Heterogeneous Parallel (Parallel Multiple)',
        description: 'Multiple different tools invoked concurrently in a single response turn.',
        example: 'Prompt: "Stock of AAPL and GOOG, plus weather in NYC and SF?" -> 2 stock + 2 weather calls.',
      },
    ],
    response_structure: {
      description: 'An array of tool calls with unique call IDs and indices',
      sample: [
        {
          id: 'call_aisak3q1px3m2lzb41ay6rwf',
          type: 'function',
          function: { name: 'get_current_weather', arguments: '{"location":"New York, NY","unit":"fahrenheit"}' },
          index: 0,
        },
        {
          id: 'call_agrjihqjcb0r499vrclwrgdj',
          type: 'function',
          function: { name: 'get_current_weather', arguments: '{"location":"San Francisco, CA","unit":"fahrenheit"}' },
          index: 1,
        },
      ],
    },
    client_execution_rule: 'Dispatch all tool calls concurrently via Promise.all / asyncio.gather for minimum latency.',
  };
}

// ── 4. Agentic Loops (Multi-step & Multi-turn) ──────────────────────────────

export function getAgenticPatternsDocs() {
  return {
    success: true,
    title: 'Agentic Function Calling Patterns Reference',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/agentic',
    patterns: {
      multi_step: {
        description: 'Sequential function calling chained inside a single conversation turn.',
        steps: [
          '1. Send initial prompt with tools defined.',
          '2. Model returns tool_calls in message.tool_calls.',
          '3. Append assistant message: { role: "assistant", content: "", tool_calls }.',
          '4. Execute functions and append tool responses: { role: "tool", tool_call_id, name, content }.',
          '5. Re-invoke model with updated message history to produce enriched response or next tool call.',
        ],
      },
      multi_turn: {
        description: 'Stateful conversation maintaining context across multiple human and tool turns.',
        steps: [
          '1. Maintain continuous messages array across requests.',
          '2. Model reasons over prior tool results from earlier turns.',
          '3. Context retention allows multi-city comparison and downstream recommendations without re-querying.',
        ],
      },
    },
    message_protocol: [
      { role: 'system', purpose: 'Defines persona, guidelines, and access to external tools.' },
      { role: 'user', purpose: 'Input query requesting actionable information.' },
      { role: 'assistant', purpose: 'Contains empty content and tool_calls array requesting execution.' },
      { role: 'tool', purpose: 'Returns stringified JSON execution result keyed by tool_call_id.' },
      { role: 'assistant', purpose: 'Final natural language synthesis after all tool results provided.' },
    ],
  };
}

// ── 5. Best Practices & Hardening ───────────────────────────────────────────

export const BEST_PRACTICES_CATALOG = [
  {
    category: 'Clear Descriptions',
    rule: 'Treat each function description as a 3-4 sentence spec. State what it does, parameter semantics, caveats, and what it does NOT return. Apply the intern test.',
  },
  {
    category: 'Unrepresentable Invalid States',
    rule: 'Use enum instead of loose booleans/strings. Mark required fields. Set additionalProperties: false. Use strict: true for guaranteed schema conformance.',
  },
  {
    category: 'Tool Set Sizing',
    rule: 'Keep active tool set under 20 tools. Consolidate operations (e.g. manage_ticket with action enum). Namespace tools by service (e.g. github_list_prs).',
  },
  {
    category: 'Offload Work to Code',
    rule: 'Drop arguments the application already holds (e.g. session IDs, current user ID). Combine always-sequential calls in code rather than forcing 2 round-trips.',
  },
  {
    category: 'Defensive Execution',
    rule: 'Check finish_reason === "tool_calls". Wrap JSON.parse in try/catch. When a tool fails, return an informative error object in role: "tool" so the model can self-correct.',
  },
  {
    category: 'Tuning & Safety',
    rule: 'Lower temperature to 0 for deterministic tool selection. Use streaming for low latency. Confirm high-consequence side-effect actions (deletes, payments) with human in the loop.',
  },
];

export function getBestPracticesDocs() {
  return {
    success: true,
    title: 'Function Calling Best Practices & Reliability Guide',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/best-practices',
    recommended_model: 'zai-org/GLM-5.3',
    soft_tool_limit: 20,
    practices: BEST_PRACTICES_CATALOG,
    good_vs_poor_example: {
      good_description: 'Retrieves current stock price for ticker. Ticker must be NYSE/NASDAQ. Returns latest trade price in USD. Does NOT return historical data or company profiles.',
      poor_description: 'Gets the stock price for a ticker.',
    },
  };
}

// ── 6. Tool Definition Validator ────────────────────────────────────────────

export function validateToolDefinition(toolDef) {
  const errors = [];
  const warnings = [];

  if (!toolDef || typeof toolDef !== 'object') {
    return { valid: false, errors: ['Tool definition must be an object.'] };
  }

  if (toolDef.type !== 'function') {
    errors.push('tool.type must be "function".');
  }

  const fn = toolDef.function;
  if (!fn || typeof fn !== 'object') {
    errors.push('tool.function object is missing.');
    return { valid: false, errors, warnings };
  }

  if (!fn.name || typeof fn.name !== 'string') {
    errors.push('function.name is required.');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(fn.name)) {
    errors.push(`function.name "${fn.name}" contains invalid characters. Use alphanumeric, underscore, or dash without spaces.`);
  }

  if (!fn.description || typeof fn.description !== 'string') {
    errors.push('function.description is required.');
  } else if (fn.description.length < 20) {
    warnings.push('function.description is very brief (< 20 chars). Aim for 3-4 descriptive sentences.');
  }

  const params = fn.parameters;
  if (!params || typeof params !== 'object') {
    errors.push('function.parameters JSON schema is required.');
  } else {
    if (params.type !== 'object') {
      errors.push('function.parameters.type must be "object".');
    }
    if (params.additionalProperties !== false) {
      warnings.push('Set additionalProperties: false on parameters to prevent unexpected arguments.');
    }
    if (fn.strict !== true) {
      warnings.push('Consider setting strict: true for guaranteed parameter constraint adherence.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    name: fn?.name || 'unknown',
  };
}

// ── 7. Protocol Message Formatters ──────────────────────────────────────────

export function formatAssistantToolCallMessage(toolCalls, content = '') {
  return {
    role: 'assistant',
    content: content || '',
    tool_calls: Array.isArray(toolCalls) ? toolCalls : [toolCalls],
  };
}

export function formatToolResponseMessage(toolCallId, functionName, responseData) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    name: functionName,
    content: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
  };
}

// ── 8. Universal Function Calling Loop Dispatcher ───────────────────────────

export async function executeFunctionCallLoop(params = {}) {
  const startTime = Date.now();
  const model = params.model || 'zai-org/GLM-5.3';
  const tools = params.tools || [];
  const maxIterations = params.max_iterations || 5;
  const toolChoice = params.tool_choice || 'auto';
  const messages = [...(params.messages || [{ role: 'user', content: params.prompt || 'Check weather in Tokyo.' }])];

  // Dry Run / Mock Mode
  if (params.dry_run) {
    const mockToolCall = {
      id: 'call_dry_run_' + Math.random().toString(36).slice(2, 10),
      type: 'function',
      function: {
        name: tools[0]?.function?.name || 'get_current_weather',
        arguments: JSON.stringify({ location: 'Tokyo, Japan', unit: 'celsius' }),
      },
    };

    const mockToolResult = { location: 'Tokyo, Japan', temperature: 18, condition: 'Clear' };

    // Record turn 1 tool request
    const assistantMsg = formatAssistantToolCallMessage([mockToolCall]);
    messages.push(assistantMsg);

    // Record turn 1 tool result
    const toolMsg = formatToolResponseMessage(mockToolCall.id, mockToolCall.function.name, mockToolResult);
    messages.push(toolMsg);

    // Record turn 2 final answer
    const finalAnswerMsg = {
      role: 'assistant',
      content: 'The current temperature in Tokyo, Japan is 18°C with clear skies.',
    };
    messages.push(finalAnswerMsg);

    return {
      success: true,
      dry_run: true,
      model,
      iterations: 2,
      duration_ms: 2,
      tool_calls_executed: [mockToolCall],
      final_response: finalAnswerMsg.content,
      messages,
    };
  }

  // Real LLM Loop Dispatcher
  let iteration = 0;
  const executedCalls = [];

  while (iteration < maxIterations) {
    iteration++;

    const response = await llmChat(messages, {
      model,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
      temperature: params.temperature ?? 0.0,
    });

    const choice = response.choices?.[0];
    const message = choice?.message || {};
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0 || choice.finish_reason === 'stop') {
      // Loop finished: natural language completion reached
      messages.push({
        role: 'assistant',
        content: message.content || '',
      });
      return {
        success: true,
        model,
        iterations: iteration,
        duration_ms: Date.now() - startTime,
        tool_calls_executed: executedCalls,
        final_response: message.content || '',
        messages,
      };
    }

    // Append assistant tool call message
    messages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: toolCalls,
    });

    // Execute tool calls (or mock executor if no local handler provided)
    for (const toolCall of toolCalls) {
      executedCalls.push(toolCall);
      const fnName = toolCall.function?.name;
      let fnArgs = {};
      try {
        fnArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch (err) {
        fnArgs = { parse_error: err.message };
      }

      let toolOutput;
      if (typeof params.tool_executor === 'function') {
        try {
          toolOutput = await params.tool_executor(fnName, fnArgs, toolCall);
        } catch (execErr) {
          toolOutput = { error: execErr.message };
        }
      } else {
        // Default safe echo return
        toolOutput = { status: 'executed', function: fnName, args: fnArgs, timestamp: new Date().toISOString() };
      }

      messages.push(formatToolResponseMessage(toolCall.id, fnName, toolOutput));
    }
  }

  return {
    success: true,
    model,
    iterations: iteration,
    duration_ms: Date.now() - startTime,
    tool_calls_executed: executedCalls,
    warning: `Exceeded max iterations (${maxIterations}).`,
    messages,
  };
}

export default {
  FUNCTION_CALLING_MODELS,
  FUNCTION_CALLING_PATTERNS,
  TOOL_CHOICE_OPTIONS,
  BEST_PRACTICES_CATALOG,
  getFunctionCallingOverview,
  getSingleCallDocs,
  getParallelCallDocs,
  getAgenticPatternsDocs,
  getBestPracticesDocs,
  validateToolDefinition,
  formatAssistantToolCallMessage,
  formatToolResponseMessage,
  executeFunctionCallLoop,
};
