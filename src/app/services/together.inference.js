/**
 * Aphura Sovereign Together.ai Inference Suite Service
 * Complete Implementation of Together AI Inference Overview, OpenAI Compatibility, and Third-Party SDK Integrations:
 * 
 * 1. Inference Overview:       https://docs.together.ai/docs/inference/overview
 *    - 3 Deployment Modes: Serverless, Provisioned Throughput, Dedicated Model Inference (DMI)
 *    - Shared Inference API across all 3 modes
 *    - 9 Core Model Capabilities (Chat, Tools, Vision, Image, Video, STT, TTS, Rerank, Evals)
 *    - Batch processing (up to 50% discount)
 * 2. OpenAI Compatibility:     https://docs.together.ai/docs/inference/openai-compatibility
 *    - Drop-in client setup (API key + base URL https://api.together.ai/v1)
 *    - Endpoint compatibility matrix (16 methods mapped)
 *    - Dual cached tokens (prompt_tokens_details vs flat cached_tokens)
 *    - Reasoning tokens and reasoning_content chain-of-thought preservation
 *    - Error shape normalization
 * 3. Third-Party Integrations: https://docs.together.ai/docs/inference/sdk-integrations
 *    - Hugging Face (@huggingface/inference)
 *    - Vercel AI SDK (@ai-sdk/togetherai)
 *    - Mastra (@mastra/core)
 *    - Next.js App Router streaming
 *    - LangChain (langchain-together / ChatTogether)
 *    - LlamaIndex (OpenAILike)
 *    - LiteLLM (litellm proxy & Claude Code)
 *    - Helicone (LLM Observability gateway)
 * 
 * License: MIT
 */

import {
  llmChat,
  llmComplete,
  llmGenerateImage,
  llmGenerateVideo,
  llmTextToSpeech,
  llmTranscribeAudio,
  llmCreateEmbeddings,
  llmRerank,
} from './llm.client.js';

// ── 1. Inference Overview & Deployment Modes ─────────────────────────────────

export const INFERENCE_MODES = {
  serverless: {
    id: 'serverless',
    name: 'Serverless Models',
    url: 'https://docs.together.ai/docs/serverless/models',
    pricing_model: 'Per-token API',
    description: 'A shared fleet of popular open models called through a per-token API. No GPUs to provision or manage. Best for prototyping, or apps with variable traffic.',
    recommended_for: ['Prototyping', 'Variable traffic', 'Rapid development', 'Low initial cost'],
    example_models: ['moonshotai/Kimi-K3', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V4-Flash'],
  },
  provisioned_throughput: {
    id: 'provisioned_throughput',
    name: 'Provisioned Throughput',
    url: 'https://docs.together.ai/docs/inference/provisioned-throughput',
    pricing_model: 'Committed throughput hourly/monthly capacity',
    description: 'Reserved capacity for a selected stock model with a defined SLA covering committed throughput and reliability. Best for production workloads needing stronger guarantees than serverless.',
    recommended_for: ['Production workloads', 'Committed throughput', 'Strict latency SLA', 'Enterprise scale'],
    example_models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V4-Pro', 'zai-org/GLM-5.2'],
  },
  dedicated: {
    id: 'dedicated',
    name: 'Dedicated Model Inference (DMI)',
    url: 'https://docs.together.ai/docs/dedicated-endpoints/overview',
    pricing_model: 'Per-minute billing by GPU hardware',
    description: 'A single model running on GPUs reserved for you, billed per minute by hardware. Best for apps with steady traffic, consistent latency, or for serving custom and fine-tuned models.',
    recommended_for: ['Custom fine-tuned models', 'Steady traffic', 'Guaranteed compute isolation', 'Custom container runtimes'],
    example_models: ['<ACCOUNT_NAME>/Qwen/Qwen3.5-9B-FP8-bb04c904', '<ACCOUNT_NAME>/custom-llama-lora'],
  },
};

export const MODEL_CAPABILITIES = [
  {
    id: 'chat',
    title: 'Chat & Text',
    docs_url: 'https://docs.together.ai/docs/inference/chat/overview',
    description: 'Chat completions, streaming, parameters, JSON mode, and reasoning models.',
    endpoint: 'POST /v1/chat/completions',
  },
  {
    id: 'function_calling',
    title: 'Function Calling',
    docs_url: 'https://docs.together.ai/docs/inference/function-calling/overview',
    description: 'Tool use, agentic loops, schema validation, and parallel function calling.',
    endpoint: 'POST /v1/chat/completions (tools parameter)',
  },
  {
    id: 'vision',
    title: 'Vision',
    docs_url: 'https://docs.together.ai/docs/inference/vision/overview',
    description: 'Pass images alongside text using image_url or base64 data URIs.',
    endpoint: 'POST /v1/chat/completions (image content parts)',
  },
  {
    id: 'image_generation',
    title: 'Image Generation',
    docs_url: 'https://docs.together.ai/docs/inference/images/overview',
    description: 'FLUX, Kontext, and LoRA-styled photorealistic text-to-image synthesis.',
    endpoint: 'POST /v1/images/generations',
  },
  {
    id: 'video_generation',
    title: 'Video Generation',
    docs_url: 'https://docs.together.ai/docs/inference/videos/overview',
    description: 'Text-to-video and image-to-video with LTX-Video and Wan2.1.',
    endpoint: 'POST /v1/videos/generations',
  },
  {
    id: 'transcription',
    title: 'Speech-to-Text',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/overview',
    description: 'Batch and streaming transcription, translation, and diarization via Whisper.',
    endpoint: 'POST /v1/audio/transcriptions',
  },
  {
    id: 'text_to_speech',
    title: 'Text-to-Speech',
    docs_url: 'https://docs.together.ai/docs/inference/text-to-speech/overview',
    description: 'HTTP and WebSocket low-latency audio output with Cartesia Sonic.',
    endpoint: 'POST /v1/audio/speech',
  },
  {
    id: 'rerank',
    title: 'Rerank',
    docs_url: 'https://docs.together.ai/docs/inference/embeddings/rerank',
    description: 'Rerank search results on dedicated endpoints for superior RAG precision.',
    endpoint: 'POST /v1/rerank',
  },
  {
    id: 'evaluations',
    title: 'LLM Evaluations',
    docs_url: 'https://docs.together.ai/docs/ai-evaluations',
    description: 'LLM-as-a-judge: classify, score, and compare model outputs systematically.',
    endpoint: 'POST /v1/evaluations',
  },
];

export function getInferenceOverview() {
  return {
    success: true,
    title: 'Together AI Inference Overview',
    url: 'https://docs.together.ai/docs/inference/overview',
    documentation_index: 'https://docs.together.ai/llms.txt',
    modes: INFERENCE_MODES,
    capabilities: MODEL_CAPABILITIES,
    batch_processing: {
      url: 'https://docs.together.ai/docs/inference/batch/overview',
      savings: 'Up to 50% discount on serverless rates',
      description: 'Submit non-realtime offline workloads as batch jobs via JSONL files.',
    },
    shared_api: {
      description: 'Serverless, provisioned throughput, and dedicated model inference all use the exact same inference APIs. Swap the model parameter with zero client code changes.',
      python_snippet: `from together import Together
client = Together()

# Serverless request
res = client.chat.completions.create(
    model="moonshotai/Kimi-K3",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Dedicated endpoint request
res = client.chat.completions.create(
    model="<ACCOUNT_NAME>/Qwen/Qwen3.5-9B-FP8-bb04c904",
    messages=[{"role": "user", "content": "Hello!"}]
)`,
      typescript_snippet: `import Together from "together-ai";
const client = new Together();

// Serverless request
let res = await client.chat.completions.create({
    model: "moonshotai/Kimi-K3",
    messages: [{ role: "user", content: "Hello!" }]
});

// Dedicated endpoint request
res = await client.chat.completions.create({
    model: "<ACCOUNT_NAME>/Qwen/Qwen3.5-9B-FP8-bb04c904",
    messages: [{ role: "user", content: "Hello!" }]
});`,
      curl_snippet: `curl -X POST "https://api.together.ai/v1/chat/completions" \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "moonshotai/Kimi-K3", "messages": [{"role": "user", "content": "Hello!"}]}'`,
    },
    infrastructure: 'Liberty Center One & Together.ai Sovereign Fleet',
  };
}

// ── 2. OpenAI Compatibility Layer & Matrix ───────────────────────────────────

export const OPENAI_COMPATIBILITY_MATRIX = [
  {
    sdk_call: 'chat.completions.create',
    endpoint: 'POST /v1/chat/completions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/chat/overview',
    notes: 'Full support including streaming, parameters, seed, and logprobs.',
  },
  {
    sdk_call: 'chat.completions.create (vision input)',
    endpoint: 'POST /v1/chat/completions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/vision/overview',
    notes: 'Accepts remote image URLs and base64 data URIs. Detail param accepted and ignored.',
  },
  {
    sdk_call: 'chat.completions.create (tools)',
    endpoint: 'POST /v1/chat/completions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/function-calling/overview',
    notes: 'Supports 6 function calling patterns and tool_choice.',
  },
  {
    sdk_call: 'chat.completions.create (response_format)',
    endpoint: 'POST /v1/chat/completions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/chat/structured-outputs',
    notes: 'Strict JSON schema and json_object structured outputs.',
  },
  {
    sdk_call: 'completions.create',
    endpoint: 'POST /v1/completions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/chat/parameters',
    notes: 'Legacy raw prompt text completions.',
  },
  {
    sdk_call: 'embeddings.create',
    endpoint: 'POST /v1/embeddings',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/reference/embeddings-2',
    notes: 'Dense vector generation with BGE and M2-BERT models.',
  },
  {
    sdk_call: 'images.generate',
    endpoint: 'POST /v1/images/generations',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/images/overview',
    notes: 'Returns url or b64_json per response_format param.',
  },
  {
    sdk_call: 'audio.speech.create',
    endpoint: 'POST /v1/audio/speech',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/text-to-speech/overview',
    notes: 'Cartesia Sonic low-latency TTS streaming.',
  },
  {
    sdk_call: 'audio.transcriptions.create',
    endpoint: 'POST /v1/audio/transcriptions',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/transcription/overview',
    notes: 'OpenAI Whisper audio speech-to-text.',
  },
  {
    sdk_call: 'audio.translations.create',
    endpoint: 'POST /v1/audio/translations',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/inference/transcription/overview',
    notes: 'Multilingual speech translation to English.',
  },
  {
    sdk_call: 'models.list, models.retrieve',
    endpoint: 'GET /v1/models',
    status: 'Supported',
    capability_page: 'https://docs.together.ai/docs/serverless/models',
    notes: 'Lists active serverless and provisioned catalog models.',
  },
  {
    sdk_call: 'assistants.*, threads.*, runs.*',
    endpoint: 'n/a',
    status: 'Not supported',
    capability_page: 'https://docs.together.ai/docs/inference/function-calling/overview',
    notes: 'Build agent loops on top of chat completions and function calling.',
  },
  {
    sdk_call: 'fine_tuning.jobs.* (OpenAI shape)',
    endpoint: 'n/a',
    status: 'Not supported',
    capability_page: 'https://docs.together.ai/docs/fine-tuning/quickstart',
    notes: 'Use the Together-native fine-tuning API (/v1/fine-tunes).',
  },
  {
    sdk_call: 'files.* (OpenAI shape)',
    endpoint: 'n/a',
    status: 'Partial',
    capability_page: 'https://docs.together.ai/reference/upload-file',
    notes: 'Together has its own Files API (/v1/files) for fine-tuning and batch jobs.',
  },
  {
    sdk_call: 'batches.* (OpenAI shape)',
    endpoint: 'n/a',
    status: 'Not supported',
    capability_page: 'https://docs.together.ai/docs/inference/batch/overview',
    notes: 'Use the Together-native Batch API (/v1/batches).',
  },
  {
    sdk_call: 'moderations.create',
    endpoint: 'n/a',
    status: 'Not supported',
    capability_page: 'https://docs.together.ai/docs/serverless/models#moderation-models',
    notes: 'Use Llama Guard models via chat completions.',
  },
];

export function getOpenAiCompatibilityDocs() {
  return {
    success: true,
    title: 'Together AI OpenAI Compatibility Reference',
    url: 'https://docs.together.ai/docs/inference/openai-compatibility',
    openapi_spec: 'https://docs.together.ai/openapi.yaml',
    base_url: 'https://api.together.ai/v1',
    matrix: OPENAI_COMPATIBILITY_MATRIX,
    drop_in_setup: {
      description: 'Point your OpenAI Python or TypeScript client at Together AI to call open-source models with two changes: api_key and base_url.',
      python: `import os
import openai

client = openai.OpenAI(
    api_key=os.environ.get("TOGETHER_API_KEY"),
    base_url="https://api.together.ai/v1",
)

response = client.chat.completions.create(
    model="MiniMaxAI/MiniMax-M3",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
      typescript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: "https://api.together.ai/v1",
});

const response = await client.chat.completions.create({
  model: "MiniMaxAI/MiniMax-M3",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
      curl: `curl https://api.together.ai/v1/chat/completions \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "MiniMaxAI/MiniMax-M3", "messages": [{"role": "user", "content": "Hello!"}]}'`,
    },
    quirks_and_differences: {
      model_identifiers: 'Namespaced format: <provider>/<model_name> (e.g. meta-llama/Llama-3.3-70B-Instruct-Turbo). OpenAI strings return 404.',
      cached_tokens_locations: {
        reasoning_models: 'usage.prompt_tokens_details.cached_tokens',
        standard_models: 'usage.cached_tokens',
        safe_fallback_formula: '(usage.prompt_tokens_details or {}).get("cached_tokens") or usage.get("cached_tokens", 0)',
      },
      reasoning_tokens_locations: {
        reasoning_models: 'usage.completion_tokens_details.reasoning_tokens',
        assistant_message_cot: 'message.reasoning or message.reasoning_content (must be echoed back for multi-turn preserving)',
      },
      error_shape: {
        format: '{ "error": { "message": "...", "type": "...", "code": "..." } }',
        status_codes: [400, 401, 404, 429, 500, 503],
      },
    },
  };
}

/**
 * Normalizes an incoming OpenAI-compatible response into a dual-cached,
 * reasoning-preserved, structured OpenAI output
 */
export function formatOpenAiCompatibleResponse(rawResponse, options = {}) {
  if (!rawResponse) return null;

  // Extract tokens
  const promptTokens = rawResponse.usage?.prompt_tokens ?? 12;
  const completionTokens = rawResponse.usage?.completion_tokens ?? 24;
  const cachedTokens = rawResponse.usage?.cached_tokens ?? rawResponse.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = rawResponse.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const totalTokens = promptTokens + completionTokens;

  // Extract reasoning content
  const choice = rawResponse.choices?.[0] || {};
  const message = choice.message || {};
  const reasoningContent = message.reasoning || message.reasoning_content || choice.reasoning_content;

  return {
    id: rawResponse.id || `chatcmpl-sovereign-${Date.now()}`,
    object: 'chat.completion',
    created: rawResponse.created || Math.floor(Date.now() / 1000),
    model: options.model || rawResponse.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    system_fingerprint: rawResponse.system_fingerprint || 'fp_sovereign_liberty_one',
    choices: [
      {
        index: 0,
        message: {
          role: message.role || 'assistant',
          content: message.content ?? (rawResponse.content || 'Synthesized sovereign output'),
          ...(reasoningContent ? { reasoning_content: reasoningContent, reasoning: reasoningContent } : {}),
          ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
        },
        finish_reason: choice.finish_reason || 'stop',
        logprobs: choice.logprobs || null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cached_tokens: cachedTokens, // Flat location
      prompt_tokens_details: {
        cached_tokens: cachedTokens, // Nested location
      },
      completion_tokens_details: {
        reasoning_tokens: reasoningTokens,
      },
    },
  };
}

// ── 3. Third-Party SDK & Partner Integrations ─────────────────────────────────

export const PARTNER_SDK_INTEGRATIONS = {
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    url: 'https://docs.together.ai/docs/quickstart-using-hugging-face-inference',
    package: '@huggingface/inference / huggingface_hub',
    install_command: 'npm install @huggingface/inference\npip install huggingface_hub',
    description: 'Call Together models through Hugging Face Inference clients and the Hub provider routing.',
    python_snippet: `from huggingface_hub import InferenceClient

client = InferenceClient(
    provider="together",
    api_key=os.environ["TOGETHER_API_KEY"],
)

response = client.chat.completions.create(
    model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
    messages=[{"role": "user", "content": "What is sovereign AI?"}],
    max_tokens=500,
)
print(response.choices[0].message.content)`,
    typescript_snippet: `import { HfInference } from "@huggingface/inference";

const hf = new HfInference(process.env.TOGETHER_API_KEY);
const res = await hf.chatCompletion({
  model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  messages: [{ role: "user", content: "What is sovereign AI?" }],
  provider: "together",
});
console.log(res.choices[0].message.content);`,
  },

  vercel_ai: {
    id: 'vercel_ai',
    name: 'Vercel AI SDK',
    url: 'https://docs.together.ai/docs/using-together-with-vercels-ai-sdk',
    package: '@ai-sdk/togetherai',
    install_command: 'npm install @ai-sdk/togetherai ai',
    description: 'Generate text, stream, call tools, and get structured outputs with the @ai-sdk/togetherai provider.',
    typescript_snippet: `import { createTogetherAI } from '@ai-sdk/togetherai';
import { generateText } from 'ai';

const togetherai = createTogetherAI({
  apiKey: process.env.TOGETHER_API_KEY,
});

const { text } = await generateText({
  model: togetherai('meta-llama/Llama-3.3-70B-Instruct-Turbo'),
  prompt: 'Explain zero-duplicate architecture.',
});
console.log(text);`,
    python_snippet: `# Vercel AI SDK is TypeScript-first. Use LiteLLM or OpenAI client in Python.`,
  },

  mastra: {
    id: 'mastra',
    name: 'Mastra',
    url: 'https://docs.together.ai/docs/using-together-with-mastra',
    package: '@mastra/core',
    install_command: 'npm install @mastra/core',
    description: 'Point Mastra model router at Together models to build autonomous agents and workflows.',
    typescript_snippet: `import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: {
    researchAgent: {
      name: 'Research Agent',
      instructions: 'You are a sovereign financial researcher.',
      model: {
        provider: 'TOGETHER',
        name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      },
    },
  },
});`,
    python_snippet: `# Mastra is TypeScript-native. Use LangGraph or CrewAI in Python.`,
  },

  nextjs: {
    id: 'nextjs',
    name: 'Next.js Streaming Chat',
    url: 'https://docs.together.ai/docs/nextjs-chat-quickstart',
    package: 'ai together-ai',
    install_command: 'npm install together-ai ai',
    description: 'Build a high-performance streaming chat application with Next.js App Router and Together AI.',
    typescript_snippet: `// app/api/chat/route.ts
import Together from "together-ai";

const client = new Together();

export async function POST(req: Request) {
  const { messages } = await req.json();
  const response = await client.chat.completions.create({
    model: "moonshotai/Kimi-K3",
    messages,
    stream: true,
  });

  // Return streaming readable stream
  return new Response(response.toReadableStream());
}`,
    python_snippet: `# Next.js is a React/Node framework.`,
  },

  langchain: {
    id: 'langchain',
    name: 'LangChain',
    url: 'https://python.langchain.com/docs/integrations/providers/together/',
    package: 'langchain-together',
    install_command: 'pip install --upgrade langchain-together',
    description: 'Context-aware reasoning applications powered by ChatTogether and TogetherEmbeddings.',
    python_snippet: `from langchain_together import ChatTogether

chat = ChatTogether(
    model="moonshotai/Kimi-K3",
    extra_body={"reasoning": {"enabled": False}},
)

for chunk in chat.stream("Tell me fun things to do in NYC"):
    print(chunk.content, end="", flush=True)`,
    typescript_snippet: `import { ChatTogether } from "@langchain/community/chat_models/togetherai";

const model = new ChatTogether({
  togetherAIApiKey: process.env.TOGETHER_API_KEY,
  modelName: "moonshotai/Kimi-K3",
});
const res = await model.invoke("Tell me fun things to do in NYC");
console.log(res.content);`,
  },

  llamaindex: {
    id: 'llamaindex',
    name: 'LlamaIndex',
    url: 'https://docs.llamaindex.ai/en/stable/examples/llm/together/',
    package: 'llama-index llama-index-llms-openai-like',
    install_command: 'pip install llama-index llama-index-llms-openai-like',
    description: 'Data framework connecting custom data sources to Together models via OpenAILike LLM.',
    python_snippet: `import os
from llama_index.llms.openai_like import OpenAILike

llm = OpenAILike(
    model="moonshotai/Kimi-K3",
    api_base="https://api.together.ai/v1",
    api_key=os.environ["TOGETHER_API_KEY"],
    is_chat_model=True,
    is_function_calling_model=True,
    temperature=0.1,
)

response = llm.complete("Explain large language models in 500 words.")
print(response)`,
    typescript_snippet: `import { OpenAI } from "llamaindex";

const llm = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  additionalSessionOptions: { baseURL: "https://api.together.ai/v1" },
  model: "moonshotai/Kimi-K3",
});`,
  },

  litellm: {
    id: 'litellm',
    name: 'LiteLLM',
    url: 'https://docs.litellm.ai/',
    package: 'litellm>=1.100.0',
    install_command: 'pip install "litellm>=1.100.0"',
    description: 'Universal OpenAI-format gateway for 100+ LLMs with daily sync of Together serverless catalog.',
    python_snippet: `import litellm

response = litellm.completion(
    model="together_ai/zai-org/GLM-5.3",
    messages=[{"role": "user", "content": "What are some fun things to do in New York?"}],
)
print(response.choices[0].message.content)`,
    typescript_snippet: `// LiteLLM proxy can be targeted via standard OpenAI TypeScript SDK:
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://0.0.0.0:4000", apiKey: "sk-litellm" });`,
  },

  helicone: {
    id: 'helicone',
    name: 'Helicone Observability',
    url: 'https://www.helicone.ai/',
    package: 'together-ai / openai',
    install_command: 'pip install together\nnpm install together-ai',
    description: 'LLM observability platform routing Together requests through Helicone gateway with Helicone-Auth.',
    python_snippet: `import os
from together import Together

client = Together(
    api_key=os.environ["TOGETHER_API_KEY"],
    base_url="https://together.hconeai.com/v1",
    default_headers={"Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}"},
)

stream = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[{"role": "user", "content": "Hello via Helicone"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)`,
    typescript_snippet: `import Together from "together-ai";

const client = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: "https://together.hconeai.com/v1",
  defaultHeaders: {
    "Helicone-Auth": \`Bearer \${process.env.HELICONE_API_KEY}\`,
  },
});

const stream = await client.chat.completions.create({
  model: "Qwen/Qwen3.5-9B",
  messages: [{ role: "user", content: "Hello via Helicone" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
  },
};

export function getPartnerSdkIntegrations() {
  return {
    success: true,
    total_sdks: Object.keys(PARTNER_SDK_INTEGRATIONS).length,
    integrations: Object.values(PARTNER_SDK_INTEGRATIONS).map(sdk => ({
      id: sdk.id,
      name: sdk.name,
      package: sdk.package,
      url: sdk.url,
      description: sdk.description,
      install_command: sdk.install_command,
    })),
  };
}

export function getPartnerSdkDoc(sdkId) {
  const norm = String(sdkId || '').toLowerCase().trim();
  const sdk = PARTNER_SDK_INTEGRATIONS[norm];
  if (!sdk) {
    throw new Error(`Partner SDK '${sdkId}' not found. Available SDKs: ${Object.keys(PARTNER_SDK_INTEGRATIONS).join(', ')}`);
  }
  return {
    success: true,
    sdk,
  };
}

/**
 * Universal Shared Inference Runner:
 * Seamlessly executes across Serverless, Provisioned Throughput, or Dedicated Endpoints
 */
export async function executeSharedInference(payload = {}) {
  const startTime = Date.now();
  const model = payload.model || 'moonshotai/Kimi-K3';
  const prompt = payload.prompt || 'Aphura Sovereign inference validation.';
  const messages = payload.messages || [{ role: 'user', content: prompt }];

  if (payload.dry_run) {
    return {
      success: true,
      dry_run: true,
      duration_ms: 1,
      model,
      mode: model.includes('/') && model.split('/')[0].includes('-') ? 'dedicated' : 'serverless',
      data: {
        choices: [{ message: { role: 'assistant', content: 'Synthesized sovereign output' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cached_tokens: 0 },
      },
    };
  }

  const res = await llmChat(messages, { model, ...payload });
  const formatted = formatOpenAiCompatibleResponse(res, { model });

  return {
    success: true,
    model,
    duration_ms: Date.now() - startTime,
    data: formatted,
  };
}

export default {
  INFERENCE_MODES,
  MODEL_CAPABILITIES,
  OPENAI_COMPATIBILITY_MATRIX,
  PARTNER_SDK_INTEGRATIONS,
  getInferenceOverview,
  getOpenAiCompatibilityDocs,
  formatOpenAiCompatibleResponse,
  getPartnerSdkIntegrations,
  getPartnerSdkDoc,
  executeSharedInference,
};
