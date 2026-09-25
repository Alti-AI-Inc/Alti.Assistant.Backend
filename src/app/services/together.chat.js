/**
 * Aphura Sovereign Together.ai Chat Inference Suite Service
 * Complete Implementation of Together AI Chat Inference across 6 Core Domains:
 * 
 * 1. Overview & Multi-Turn:   https://docs.together.ai/docs/inference/chat/overview
 *    - Single queries, multi-turn conversations (system, user, assistant roles)
 *    - Streaming SSE chunks, AsyncTogether parallel execution
 * 2. Parameters:              https://docs.together.ai/docs/inference/chat/parameters
 *    - max_tokens, stop, temperature, top_p, top_k, repetition_penalty, frequency_penalty, presence_penalty, seed, n
 * 3. Structured Outputs:      https://docs.together.ai/docs/inference/chat/structured-outputs
 *    - json_schema (Pydantic / Zod schema enforcement)
 *    - regex mode (pattern enforcement)
 * 4. Reasoning Models:        https://docs.together.ai/docs/inference/chat/reasoning
 *    - Hybrid models, reasoning_effort (low/medium/high), thinking modes (interleaved, preserved, turn-level)
 *    - Field extractors (reasoning, reasoning_content, <think> tags)
 * 5. Prompt Caching:          https://docs.together.ai/docs/inference/chat/prompt-caching
 *    - Automatic KV state reuse, prompt_cache_key routing stickiness
 *    - Dual usage cached token reporting (prompt_tokens_details vs flat cached_tokens)
 * 6. Log Probabilities:       https://docs.together.ai/docs/inference/chat/logprobs
 *    - logprobs: 1 per-token confidence metrics & top_logprobs
 *    - Confidence-based model escalation routing
 * 
 * License: MIT
 */

import { llmChat } from './llm.client.js';

// ── 1. Roles & Core Overview ────────────────────────────────────────────────

export const CHAT_ROLES = ['system', 'user', 'assistant', 'tool'];

export function getChatOverview() {
  return {
    success: true,
    title: 'Together AI Send Chat Completions Overview',
    docs_url: 'https://docs.together.ai/docs/inference/chat/overview',
    roles: [
      { role: 'system', description: 'Sets overall persona, behavioral guidelines, and schema rules.' },
      { role: 'user', description: 'Represents messages sent by the end-user or client application.' },
      { role: 'assistant', description: 'Historical responses produced by the model carrying conversation state.' },
      { role: 'tool', description: 'Return values from function calling and tool execution.' },
    ],
    features: {
      streaming: {
        description: 'Server-sent events streaming partial tokens via stream: true.',
        format: 'SSE with data: JSON payloads',
      },
      parallel_async: {
        description: 'AsyncTogether / asyncio.gather parallel independent query dispatching.',
      },
    },
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    reasoning={"enabled": False},
    messages=[
        {"role": "system", "content": "You are a helpful travel guide."},
        {"role": "user", "content": "What are some fun things to do in New York?"}
    ],
    stream=True
)`,
      typescript: `import Together from "together-ai";
const client = new Together();

const response = await client.chat.completions.create({
  model: "Qwen/Qwen3.5-9B",
  reasoning: { enabled: false },
  messages: [
    { role: "system", content: "You are a helpful travel guide." },
    { role: "user", content: "What are some fun things to do in New York?" }
  ],
  stream: true,
});`,
    },
    infrastructure: 'Liberty Center One & Together.ai Sovereign Fleet',
  };
}

// ── 2. Parameters Schema & Quick Reference ──────────────────────────────────

export const CHAT_PARAMETERS_SCHEMA = {
  max_tokens: {
    type: 'integer',
    description: 'Maximum number of tokens allowed in response. Use 1 for classifications, unset for full generation.',
    default: null,
  },
  stop: {
    type: 'array|string',
    description: 'Stop generation string or list of strings boundary markers (e.g. ["\\n\\n"]).',
    default: null,
  },
  temperature: {
    type: 'number',
    range: [0.0, 2.0],
    description: 'Controls randomness. 0 is deterministic greedy decoding; ~0.7-1.0 adds variety.',
    default: 0.7,
  },
  top_p: {
    type: 'number',
    range: [0.0, 1.0],
    description: 'Nucleus sampling cumulative probability cutoff (e.g. 0.9 = top 90% mass).',
    default: 1.0,
  },
  top_k: {
    type: 'integer',
    description: 'Caps sampling to k most likely next tokens. 1 is greedy.',
    default: 0,
  },
  repetition_penalty: {
    type: 'number',
    description: 'Discourages repeating tokens that have appeared anywhere in prompt/output. Recommended 1.1.',
    default: 1.0,
  },
  frequency_penalty: {
    type: 'number',
    range: [-2.0, 2.0],
    description: 'Penalizes tokens proportionally to frequency in generated output.',
    default: 0.0,
  },
  presence_penalty: {
    type: 'number',
    range: [-2.0, 2.0],
    description: 'Penalizes tokens that have appeared at all, encouraging new topics.',
    default: 0.0,
  },
  seed: {
    type: 'integer',
    description: 'Best-effort deterministic sampling seed for reproducible evals and regression testing.',
    default: null,
  },
  n: {
    type: 'integer',
    description: 'Number of independent candidate completions generated in choices array.',
    default: 1,
  },
  response_format: {
    type: 'object',
    description: 'Constrains output to json_schema, json_object, or regex pattern.',
    default: null,
  },
  logprobs: {
    type: 'integer',
    description: 'Pass 1 to return per-token log probabilities and top alternatives.',
    default: null,
  },
  reasoning: {
    type: 'object',
    description: 'Toggle reasoning mode on hybrid models via {"enabled": true|false}.',
    default: null,
  },
  reasoning_effort: {
    type: 'string',
    enum: ['low', 'medium', 'high', 'max'],
    description: 'Controls reasoning compute budget on GPT-OSS and DeepSeek models.',
    default: 'medium',
  },
  prompt_cache_key: {
    type: 'string',
    description: 'Routes requests sharing a prefix as a group for maximum KV cache hits.',
    default: null,
  },
};

export function getChatParametersDocs() {
  return {
    success: true,
    title: 'Chat Completion Parameters Reference',
    docs_url: 'https://docs.together.ai/docs/inference/chat/parameters',
    schema: CHAT_PARAMETERS_SCHEMA,
    quick_troubleshooting: [
      { problem: 'Output cuts off mid-sentence', solution: 'Increase max_tokens' },
      { problem: 'Need exactly one token (yes/no, class label)', solution: 'Set max_tokens: 1' },
      { problem: 'Responses feel generic or repetitive', solution: 'Increase temperature, or set frequency_penalty: 0.2' },
      { problem: 'Output loops on the same phrase', solution: 'Set repetition_penalty: 1.1' },
      { problem: 'Need identical answers across regression runs', solution: 'Set seed (e.g. 42) and low temperature' },
      { problem: 'Need machine-parseable JSON', solution: 'Set response_format with json_schema' },
      { problem: 'Need token-level confidence scores', solution: 'Set logprobs: 1' },
    ],
  };
}

// ── 3. Structured Outputs (JSON Schema & Regex) ─────────────────────────────

export const STRUCTURED_OUTPUT_MODES = {
  json_schema: {
    type: 'json_schema',
    description: 'Strict schema enforcement via Pydantic model_json_schema() or Zod toJSONSchema().',
    example: {
      type: 'json_schema',
      json_schema: {
        name: 'user_profile',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'email'],
        },
      },
    },
  },
  regex: {
    type: 'regex',
    description: 'Strict regex pattern matching (e.g. sentiment classification or phone number).',
    example: {
      type: 'regex',
      pattern: '(positive|neutral|negative)',
    },
  },
};

export function getStructuredOutputsDocs() {
  return {
    success: true,
    title: 'Structured Outputs & JSON Mode',
    docs_url: 'https://docs.together.ai/docs/inference/chat/structured-outputs',
    modes: STRUCTURED_OUTPUT_MODES,
    best_practices: [
      'Always prompt the model to "Only answer in JSON" in the system prompt.',
      'Embed a plain text copy of the JSON schema in the system prompt in addition to response_format.',
      'Check finish_reason: if "length", output was truncated and JSON will be malformed; increase max_tokens.',
      'Validate example JSON in prompts before sending to avoid model copying malformed syntax.',
    ],
    code_snippets: {
      python: `completion = client.chat.completions.create(
    model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
    messages=[{"role": "user", "content": "Review: Loved it!"}],
    response_format={"type": "regex", "pattern": "(positive|neutral|negative)"}
)`,
      typescript: `const completion = await together.chat.completions.create({
  model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  messages: [{ role: "user", content: "Review: Loved it!" }],
  response_format: { type: "regex", pattern: "(positive|neutral|negative)" },
});`,
    },
  };
}

// ── 4. Reasoning Models & Thinking Modes ────────────────────────────────────

export const REASONING_MODELS_CATALOG = [
  { model: 'MiniMaxAI/MiniMax-M3', type: 'Hybrid (on by default)', context_length: '512K', reasoning_field: 'reasoning_content' },
  { model: 'deepseek-ai/DeepSeek-V4-Pro-0813', type: 'Hybrid (on by default)', context_length: '1M', reasoning_field: 'reasoning' },
  { model: 'zai-org/GLM-5.2', type: 'Hybrid (on by default)', context_length: '512K', reasoning_field: 'reasoning_content' },
  { model: 'moonshotai/Kimi-K3', type: 'Hybrid (on by default)', context_length: '1M', reasoning_field: 'reasoning_content' },
  { model: 'Qwen/Qwen3.6-Plus', type: 'Hybrid (on by default)', context_length: '1M', reasoning_field: 'reasoning_content' },
  { model: 'Qwen/Qwen3.5-9B', type: 'Hybrid (on by default)', context_length: '262K', reasoning_field: 'reasoning_content' },
  { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', type: 'Adjustable effort', context_length: '128K', reasoning_field: 'reasoning' },
  { model: 'deepseek-ai/DeepSeek-R1', type: 'Reasoning only', context_length: '128K', reasoning_field: '<think> tag in content' },
];

export function getReasoningDocs() {
  return {
    success: true,
    title: 'Reasoning Models & Thinking Modes Reference',
    docs_url: 'https://docs.together.ai/docs/inference/chat/reasoning',
    models: REASONING_MODELS_CATALOG,
    thinking_modes: {
      interleaved: {
        description: 'Default mode. Model reasons between tool calls and after receiving tool outputs.',
      },
      preserved: {
        description: 'Setting clear_thinking: false retains reasoning from prior assistant turns for coding agents.',
        rule: 'Echo back unmodified reasoning_content in historical assistant messages.',
      },
      turn_level: {
        description: 'Enable reasoning only on complex turns via reasoning={"enabled": true|false} to optimize cost.',
      },
    },
    effort_levels: {
      low: 'Faster responses for simpler tasks with reduced reasoning depth.',
      medium: 'Balanced performance for most tasks (recommended default).',
      high: 'Maximum reasoning depth for complex math/coding (~30k tokens budget).',
    },
    prompting_tips: [
      'Use temperature 1.0 for GLM/Kimi/DeepSeek-V4/GPT-OSS; use 0.6 for DeepSeek-R1.',
      'Omit "think step by step" instructions — models reason automatically.',
      'Avoid few-shot examples that constrain reasoning chains.',
      'Think in goals and high-level objectives rather than micro-steps.',
    ],
  };
}

/**
 * Extracts reasoning chain-of-thought tokens from any Together response
 */
export function extractReasoningTokens(choice) {
  if (!choice) return { reasoning: null, content: null };
  const message = choice.message || choice.delta || {};
  let reasoning = message.reasoning || message.reasoning_content || null;
  let content = message.content || '';

  // Handle DeepSeek-R1 <think> tags embedded in content
  if (!reasoning && typeof content === 'string' && content.includes('<think>')) {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      reasoning = thinkMatch[1].trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    }
  }

  return {
    reasoning,
    content,
    has_reasoning: Boolean(reasoning && reasoning.length > 0),
  };
}

// ── 5. Prompt Caching & Routing Stickiness ──────────────────────────────────

export function getPromptCachingDocs() {
  return {
    success: true,
    title: 'Automatic Prompt Caching Reference',
    docs_url: 'https://docs.together.ai/docs/inference/chat/prompt-caching',
    mechanism: 'Automatic prefix KV cache reuse across serverless fleet and dedicated endpoints.',
    rules_for_max_hits: [
      'Put stable content first: system prompt, tool definitions, static instructions, reference docs.',
      'Append instead of rewriting: keep conversation history byte-identical.',
      'Keep tool schemas and order identical across turns.',
      'Set reasoning parameters once before conversation starts.',
      'Pass prompt_cache_key to route related requests to the same replica.',
    ],
    usage_reporting: {
      nested: 'usage.prompt_tokens_details.cached_tokens (Reasoning models)',
      flat: 'usage.cached_tokens (Standard models)',
      formula: '(usage.prompt_tokens_details or {}).get("cached_tokens") or usage.get("cached_tokens", 0)',
    },
  };
}

// ── 6. Log Probabilities & Confidence Escalation ────────────────────────────

export function getLogprobsDocs() {
  return {
    success: true,
    title: 'Log Probabilities (logprobs) Reference',
    docs_url: 'https://docs.together.ai/docs/inference/chat/logprobs',
    parameter: 'logprobs: 1',
    description: 'Returns per-token log probabilities to measure model confidence and drive cascade escalation.',
    formula: 'probability = Math.exp(logprob)',
    use_cases: [
      'Classification gating: escalate to 70B/120B model if confidence < 0.85.',
      'Autocomplete token ranking.',
      'Hallucination and uncertainty detection.',
    ],
    code_snippet: `completion = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[{"role": "user", "content": "Categorize email"}],
    logprobs=1
)
logprob = completion.choices[0].logprobs.content[0]["logprob"]
confidence = math.exp(logprob)
if confidence < 0.85:
    # Escalate to Llama-3.3-70B
    pass`,
  };
}

/**
 * Calculates linear probability (0..1) from a natural logprob
 */
export function calculateTokenConfidence(logprob) {
  if (typeof logprob !== 'number') return null;
  return Math.min(1.0, Math.max(0.0, Math.exp(logprob)));
}

/**
 * Universal Chat Completion Dispatcher
 */
export async function executeChatCompletion(params = {}) {
  const startTime = Date.now();
  const model = params.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
  const prompt = params.prompt || 'Hello sovereign chat.';
  const messages = params.messages || [{ role: 'user', content: prompt }];

  if (params.dry_run) {
    const isReasoning = model.includes('DeepSeek') || model.includes('GLM') || model.includes('Kimi') || model.includes('gpt-oss');
    return {
      success: true,
      dry_run: true,
      duration_ms: 1,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Synthesized sovereign chat response.',
            ...(isReasoning ? { reasoning_content: 'Step 1: Evaluated query. Step 2: Formulated answer.' } : {}),
          },
          finish_reason: 'stop',
          ...(params.logprobs ? {
            logprobs: {
              content: [
                { token: 'Synthesized', logprob: -0.05, top_logprobs: [{ token: 'Synthesized', logprob: -0.05 }] },
                { token: ' sovereign', logprob: -0.01, top_logprobs: [{ token: ' sovereign', logprob: -0.01 }] },
              ],
            },
          } : {}),
        },
      ],
      usage: {
        prompt_tokens: 14,
        completion_tokens: 28,
        total_tokens: 42,
        cached_tokens: params.prompt_cache_key ? 10 : 0,
        prompt_tokens_details: { cached_tokens: params.prompt_cache_key ? 10 : 0 },
        completion_tokens_details: { reasoning_tokens: isReasoning ? 12 : 0 },
      },
    };
  }

  const rawRes = await llmChat(messages, params);
  const reasoningData = extractReasoningTokens(rawRes.choices?.[0]);

  return {
    success: true,
    model,
    duration_ms: Date.now() - startTime,
    reasoning_extracted: reasoningData.has_reasoning,
    data: rawRes,
  };
}

export default {
  CHAT_ROLES,
  CHAT_PARAMETERS_SCHEMA,
  STRUCTURED_OUTPUT_MODES,
  REASONING_MODELS_CATALOG,
  getChatOverview,
  getChatParametersDocs,
  getStructuredOutputsDocs,
  getReasoningDocs,
  extractReasoningTokens,
  getPromptCachingDocs,
  getLogprobsDocs,
  calculateTokenConfidence,
  executeChatCompletion,
};
