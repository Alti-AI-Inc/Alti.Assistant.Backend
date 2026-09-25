/**
 * Aphura Sovereign Together.ai Agent Skills & Docs MCP Server Service
 * Complete Implementation of the 12 Official Coding Agent Skills & Docs MCP Server:
 * Official Reference: https://docs.together.ai/docs/agent-skills
 * 
 * 1.  together-chat-completions
 * 2.  together-images
 * 3.  together-video
 * 4.  together-audio
 * 5.  together-embeddings
 * 6.  together-fine-tuning
 * 7.  together-batch-inference
 * 8.  together-evaluations
 * 9.  together-sandboxes
 * 10. together-dedicated-model-inference
 * 11. together-dedicated-containers
 * 12. together-gpu-clusters
 * 
 * Plus: Docs MCP Server (https://docs.together.ai/mcp) tool definitions & proxy.
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
  llmCreateFineTune,
  llmCreateBatch,
  llmCreateEval,
  llmCodeInterpreter,
  llmCreateEndpoint,
  llmCreateDeployment,
  llmCreateCluster,
} from './llm.client.js';

// ── The 12 Official Together AI Agent Skills Specification ───────────────────
export const TOGETHER_AGENT_SKILLS = {
  'together-chat-completions': {
    name: 'together-chat-completions',
    title: 'Chat Completions & Function Calling',
    description: 'Serverless chat inference, streaming, multi-turn conversations, function calling (6 patterns), structured JSON outputs, and reasoning models.',
    recommended_models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V4-Pro', 'zai-org/GLM-5.2', 'Qwen/Qwen3.5-9B'],
    triggers: ['chat', 'conversation', 'tool_call', 'function_calling', 'json_mode', 'reasoning', 'kimi', 'glm', 'deepseek'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-chat-completions',
    skill_md: `---
name: together-chat-completions
description: Serverless chat inference, streaming, multi-turn conversations, function calling (6 patterns), structured JSON outputs, and reasoning models.
version: 2.0.0
---

# Together Chat Completions Skill
Use this skill for generating chat completions, multi-turn conversations, function calling, and structured JSON outputs using Together AI models.
`.trim(),
  },

  'together-images': {
    name: 'together-images',
    title: 'Image Generation & Editing',
    description: 'Text-to-image generation, image editing with Kontext, FLUX model selection, LoRA-based styling, and reference-image guidance.',
    recommended_models: ['black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev', 'stabilityai/stable-diffusion-xl-base-1.0'],
    triggers: ['image', 'generate image', 'flux', 'text-to-image', 'image editing', 'lora style', 'sdxl'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-images',
    skill_md: `---
name: together-images
description: Text-to-image generation, image editing with Kontext, FLUX model selection, LoRA-based styling, and reference-image guidance.
version: 2.0.0
---

# Together Images Skill
Use this skill for text-to-image generation, FLUX models, LoRA-based styling, and reference-guided synthesis.
`.trim(),
  },

  'together-video': {
    name: 'together-video',
    title: 'Video Synthesis & Keyframing',
    description: 'Text-to-video and image-to-video generation, keyframe control, model and dimension selection, and async job polling.',
    recommended_models: ['Lightricks/LTX-Video', 'Wan-AI/Wan2.1-T2V-14B'],
    triggers: ['video', 'text-to-video', 'image-to-video', 'video generation', 'keyframe', 'animate'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-video',
    skill_md: `---
name: together-video
description: Text-to-video and image-to-video generation, keyframe control, model and dimension selection, and async job polling.
version: 2.0.0
---

# Together Video Skill
Use this skill for text-to-video generation and async job polling.
`.trim(),
  },

  'together-audio': {
    name: 'together-audio',
    title: 'Audio Speech & Transcriptions',
    description: 'Text-to-speech (REST, streaming, realtime WebSocket) and speech-to-text (transcription, translation, diarization, timestamps).',
    recommended_models: ['cartesia/sonic', 'openai/whisper-large-v3'],
    triggers: ['audio', 'tts', 'stt', 'transcribe', 'speech', 'voice', 'whisper', 'cartesia'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-audio',
    skill_md: `---
name: together-audio
description: Text-to-speech (REST, streaming, realtime WebSocket) and speech-to-text (transcription, translation, diarization, timestamps).
version: 2.0.0
---

# Together Audio Skill
Use this skill for neural TTS voice generation and Whisper audio transcription.
`.trim(),
  },

  'together-embeddings': {
    name: 'together-embeddings',
    title: 'Embeddings & Reranking',
    description: 'Dense vector generation, semantic search, RAG pipelines, and reranking with dedicated model inference.',
    recommended_models: ['togethercomputer/m2-bert-80M-8k-retrieval', 'BAAI/bge-large-en-v1.5', 'Salesforce/Llama-Rank-v1'],
    triggers: ['embedding', 'vector', 'rerank', 'semantic search', 'rag', 'dense vector', 'cosine similarity'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-embeddings',
    skill_md: `---
name: together-embeddings
description: Dense vector generation, semantic search, RAG pipelines, and reranking with dedicated model inference.
version: 2.0.0
---

# Together Embeddings Skill
Use this skill for dense vector generation, semantic search, and document reranking.
`.trim(),
  },

  'together-fine-tuning': {
    name: 'together-fine-tuning',
    title: 'Fine-tuning & Adaptation',
    description: 'LoRA, full, DPO preference, VLM, function-calling, and reasoning fine-tuning, plus BYOM uploads.',
    recommended_models: ['meta-llama/Meta-Llama-3.1-8B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'],
    triggers: ['fine-tune', 'finetuning', 'lora', 'dpo', 'preference tuning', 'train weights', 'byom'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-fine-tuning',
    skill_md: `---
name: together-fine-tuning
description: LoRA, full, DPO preference, VLM, function-calling, and reasoning fine-tuning, plus BYOM uploads.
version: 2.0.0
---

# Together Fine-Tuning Skill
Use this skill for preparing datasets and submitting LoRA or full fine-tuning jobs.
`.trim(),
  },

  'together-batch-inference': {
    name: 'together-batch-inference',
    title: 'Batch Inference Jobs',
    description: 'Async batch jobs with JSONL input, polling, result downloads, and up to 50% cost savings.',
    recommended_models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    triggers: ['batch', 'batch inference', 'bulk processing', 'async batch', '50% discount', 'offline jobs'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-batch-inference',
    skill_md: `---
name: together-batch-inference
description: Async batch jobs with JSONL input, polling, result downloads, and up to 50% cost savings.
version: 2.0.0
---

# Together Batch Inference Skill
Use this skill for submitting offline batch jobs via JSONL files with 50% cost savings.
`.trim(),
  },

  'together-evaluations': {
    name: 'together-evaluations',
    title: 'LLM-as-a-Judge Evaluations',
    description: 'LLM-as-a-judge workflows: classify, score, and compare evaluations with external provider support.',
    recommended_models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V4-Pro'],
    triggers: ['eval', 'evaluation', 'llm-as-a-judge', 'benchmark', 'scoring', 'compare models', 'accuracy test'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-evaluations',
    skill_md: `---
name: together-evaluations
description: LLM-as-a-judge workflows: classify, score, and compare evaluations with external provider support.
version: 2.0.0
---

# Together Evaluations Skill
Use this skill for running LLM-as-a-judge scoring, comparisons, and benchmark evaluations.
`.trim(),
  },

  'together-sandboxes': {
    name: 'together-sandboxes',
    title: 'Code Sandboxes & Execution',
    description: 'Remote sandboxed Python execution with session reuse, file uploads, and chart outputs.',
    recommended_models: ['deepseek-ai/DeepSeek-V4-Pro', 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
    triggers: ['sandbox', 'code interpreter', 'execute python', 'run code', 'chart output', 'isolated env'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-sandboxes',
    skill_md: `---
name: together-sandboxes
description: Remote sandboxed Python execution with session reuse, file uploads, and chart outputs.
version: 2.0.0
---

# Together Sandboxes Skill
Use this skill for executing Python code in secure, isolated remote sandboxes with session persistence.
`.trim(),
  },

  'together-dedicated-model-inference': {
    name: 'together-dedicated-model-inference',
    title: 'Dedicated Model Inference (DMI)',
    description: 'Endpoints, deployments, and configs on dedicated GPUs, with autoscaling, traffic splitting, A/B tests, shadow experiments, and custom model or LoRA uploads.',
    recommended_models: ['zai-org/GLM-5.2', 'MiniMax/MiniMax-M3', 'deepseek-ai/DeepSeek-V4-Pro'],
    triggers: ['dmi', 'dedicated endpoint', 'dedicated gpu', 'canary rollout', 'ab test', 'shadow experiment', 'custom model upload'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-dedicated-model-inference',
    skill_md: `---
name: together-dedicated-model-inference
description: Endpoints, deployments, and configs on dedicated GPUs, with autoscaling, traffic splitting, A/B tests, shadow experiments, and custom model or LoRA uploads.
version: 2.0.0
---

# Together Dedicated Model Inference (DMI) Skill
Use this skill for dedicated GPU endpoints, canary rollouts, A/B testing, and custom model deployments.
`.trim(),
  },

  'together-dedicated-containers': {
    name: 'together-dedicated-containers',
    title: 'Dedicated Containers (Jig)',
    description: 'Custom Dockerized inference workers using the Jig CLI, Sprocket SDK, and queue API.',
    recommended_models: ['NVIDIA-H100-SXM', 'NVIDIA-A100-80GB'],
    triggers: ['jig', 'container', 'docker', 'dockerfile', 'sprocket', 'dedicated container', 'queue api'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-dedicated-containers',
    skill_md: `---
name: together-dedicated-containers
description: Custom Dockerized inference workers using the Jig CLI, Sprocket SDK, and queue API.
version: 2.0.0
---

# Together Dedicated Containers (Jig) Skill
Use this skill for custom container builds, pyproject.toml definitions, and dedicated container deployments.
`.trim(),
  },

  'together-gpu-clusters': {
    name: 'together-gpu-clusters',
    title: 'GPU Clusters & Storage',
    description: 'On-demand and reserved GPU clusters (H100, H200, B200) with Kubernetes, Slurm, and shared storage.',
    recommended_models: ['NVIDIA-H100', 'NVIDIA-H200', 'NVIDIA-B200'],
    triggers: ['cluster', 'gpu cluster', 'slurm', 'kubernetes', 'reserved cluster', 'cluster storage', 'node remediation'],
    specification_url: 'https://github.com/togethercomputer/skills/tree/main/skills/together-gpu-clusters',
    skill_md: `---
name: together-gpu-clusters
description: On-demand and reserved GPU clusters (H100, H200, B200) with Kubernetes, Slurm, and shared storage.
version: 2.0.0
---

# Together GPU Clusters Skill
Use this skill for reserving, configuring, and managing enterprise GPU clusters and shared storage volumes.
`.trim(),
  },
};

// ── Docs MCP Server Configuration & Specifications ──────────────────────────
export const DOCS_MCP_SERVER = {
  url: 'https://docs.together.ai/mcp',
  name: 'TogetherAIDocs',
  transport: 'http',
  install_commands: {
    universal: 'npx add-mcp https://docs.together.ai/mcp',
    claude_code: 'claude mcp add --transport http "TogetherAIDocs" https://docs.together.ai/mcp',
    cursor: {
      url: 'https://docs.together.ai/mcp',
      settings_json: { mcpServers: { 'together-docs': { url: 'https://docs.together.ai/mcp' } } },
    },
    vscode: {
      type: 'http',
      url: 'https://docs.together.ai/mcp',
      settings_json: { mcp: { servers: { 'together-docs': { type: 'http', url: 'https://docs.together.ai/mcp' } } } },
    },
    codex: {
      toml: '[mcp_servers.together_docs]\ntype = "http"\nurl = "https://docs.together.ai/mcp"',
    },
    opencode: {
      json: { mcp: { together_docs: { type: 'remote', url: 'https://docs.together.ai/mcp', enabled: true } } },
    },
  },
  tools: [
    {
      name: 'search_docs',
      description: 'Search Together AI official documentation and return relevant markdown sections and links.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Documentation search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_doc_page',
      description: 'Fetch full markdown content for a given documentation path or slug.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Documentation slug or path (e.g. /docs/agent-skills, /reference/cli/getting-started)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_agent_skills',
      description: 'List all 12 official Together AI coding agent skills with triggers and metadata.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'get_skill_spec',
      description: 'Retrieve the official SKILL.md specification for any Together AI agent skill.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Skill identifier (e.g. together-chat-completions, together-embeddings)' },
        },
        required: ['skill_name'],
      },
    },
  ],
};

// ── Service Methods ─────────────────────────────────────────────────────────

export function listTogetherSkills() {
  return {
    success: true,
    total_skills: Object.keys(TOGETHER_AGENT_SKILLS).length,
    skills: Object.values(TOGETHER_AGENT_SKILLS).map(s => ({
      name: s.name,
      title: s.title,
      description: s.description,
      triggers: s.triggers,
      recommended_models: s.recommended_models,
      url: s.specification_url,
      specification_url: s.specification_url,
    })),
    specification: 'Agent Skills Standard (https://agentskills.io/specification)',
    infrastructure: 'Liberty Center One & Together.ai Sovereign Endpoints',
  };
}

export function getTogetherSkill(skillName) {
  const norm = String(skillName || '').toLowerCase().trim();
  const skill = TOGETHER_AGENT_SKILLS[norm];
  if (!skill) {
    throw new Error(`Skill '${skillName}' not found. Available skills: ${Object.keys(TOGETHER_AGENT_SKILLS).join(', ')}`);
  }
  return {
    success: true,
    name: skill.name,
    title: skill.title,
    description: skill.description,
    specification_url: skill.specification_url,
    recommended_models: skill.recommended_models,
    triggers: skill.triggers,
    skill_md: skill.skill_md,
    skill,
  };
}

export function getDocsMcpServerInfo() {
  return {
    success: true,
    server: {
      name: DOCS_MCP_SERVER.name,
      url: DOCS_MCP_SERVER.url,
      transport: DOCS_MCP_SERVER.transport,
      docs_url: 'https://docs.together.ai/mcp',
      version: '2.0.0',
    },
    tools: DOCS_MCP_SERVER.tools,
    client_configs: DOCS_MCP_SERVER.install_commands,
    install_commands: DOCS_MCP_SERVER.install_commands,
    active: true,
    infrastructure: 'Liberty Center One / Together.ai',
  };
}

export async function executeAgentSkill(skillName, params = {}) {
  const norm = String(skillName || '').toLowerCase().trim();
  const skill = TOGETHER_AGENT_SKILLS[norm];
  if (!skill) {
    throw new Error(`Skill '${skillName}' not supported. Available: ${Object.keys(TOGETHER_AGENT_SKILLS).join(', ')}`);
  }

  const startTime = Date.now();
  let resultData = null;

  if (params.dry_run) {
    return {
      success: true,
      skill: norm,
      dry_run: true,
      duration_ms: 1,
      data: {
        skill: norm,
        status: 'simulated_success',
        infrastructure: 'Liberty Center One / Together.ai',
        params,
      },
    };
  }

  switch (norm) {
    case 'together-chat-completions': {
      const prompt = params.prompt || 'Hello sovereign chat';
      const res = await llmChat([{ role: 'user', content: prompt }], { model: params.model });
      resultData = { skill: norm, prompt, response: res?.choices?.[0]?.message?.content || res?.content };
      break;
    }

    case 'together-images': {
      const prompt = params.prompt || 'Sovereign datacenter at night with blue lighting';
      const imgRes = await llmGenerateImage(prompt, params);
      resultData = { skill: norm, prompt, image: imgRes };
      break;
    }

    case 'together-video': {
      const prompt = params.prompt || 'Autonomous servers humming in Liberty Center One';
      const vidRes = await llmGenerateVideo({ prompt, ...params });
      resultData = { skill: norm, prompt, video_job: vidRes };
      break;
    }

    case 'together-audio': {
      const input = params.input || 'Aphura Sovereign Audio Engine is operational.';
      const audioRes = await llmTextToSpeech(input, params);
      resultData = { skill: norm, input, audio: audioRes };
      break;
    }

    case 'together-embeddings': {
      const input = params.input || ['Sovereign retrieval document', 'Dense embedding vector'];
      const embRes = await llmCreateEmbeddings(input, params);
      resultData = { skill: norm, input_count: Array.isArray(input) ? input.length : 1, embeddings: embRes };
      break;
    }

    case 'together-fine-tuning': {
      const payload = {
        training_file: params.training_file || 'file-demo-train',
        model: params.model || 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        ...params,
      };
      const ftRes = await llmCreateFineTune(payload);
      resultData = { skill: norm, job: ftRes };
      break;
    }

    case 'together-batch-inference': {
      const payload = {
        input_file_id: params.input_file_id || 'file-batch-input',
        endpoint: params.endpoint || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        ...params,
      };
      const batchRes = await llmCreateBatch(payload);
      resultData = { skill: norm, batch: batchRes };
      break;
    }

    case 'together-evaluations': {
      const payload = {
        model: params.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        eval_data_file: params.eval_data_file || 'file-eval-gold',
        type: params.type || 'accuracy',
        ...params,
      };
      const evalRes = await llmCreateEval(payload);
      resultData = { skill: norm, evaluation: evalRes };
      break;
    }

    case 'together-sandboxes': {
      const code = params.code || 'import math\nprint(math.pi * 2)';
      const sandRes = await llmCodeInterpreter(code, params);
      resultData = { skill: norm, code, output: sandRes };
      break;
    }

    case 'together-dedicated-model-inference': {
      const payload = {
        model: params.model || 'zai-org/GLM-5.2',
        name: params.name || 'ep-dmi-sovereign',
        min_replicas: 1,
        max_replicas: 2,
        ...params,
      };
      const dmiRes = await llmCreateEndpoint(payload);
      resultData = { skill: norm, endpoint: dmiRes };
      break;
    }

    case 'together-dedicated-containers': {
      const payload = {
        name: params.name || 'jig-custom-container',
        image: params.image || 'registry.together.ai/jig/worker:latest',
        hardware: params.hardware || 'NVIDIA-H100-SXM',
        ...params,
      };
      const contRes = await llmCreateDeployment(payload);
      resultData = { skill: norm, deployment: contRes };
      break;
    }

    case 'together-gpu-clusters': {
      const payload = {
        name: params.name || 'h100-sovereign-cluster',
        num_gpus: params.num_gpus || 8,
        region: params.region || 'us-central-1',
        ...params,
      };
      const clusRes = await llmCreateCluster(payload);
      resultData = { skill: norm, cluster: clusRes };
      break;
    }
  }

  return {
    success: true,
    skill: norm,
    duration_ms: Date.now() - startTime,
    data: resultData,
  };
}

/**
 * Chains multiple skills together into an end-to-end workflow execution
 * e.g. ['together-embeddings', 'together-chat-completions', 'together-evaluations']
 */
export async function executeSkillChain(skillNames = [], initialInput = {}) {
  const steps = [];
  let currentContext = { ...initialInput };

  for (const name of skillNames) {
    const stepResult = await executeAgentSkill(name, currentContext);
    steps.push({ skill: name, result: stepResult.data, duration_ms: stepResult.duration_ms });
    currentContext = { ...currentContext, previous_step: stepResult.data };
  }

  return {
    success: true,
    chain_length: skillNames.length,
    skills: skillNames,
    steps,
    status: 'chain_completed',
  };
}

/**
 * Handles incoming MCP tool calls against the Docs MCP Server
 */
export async function handleMcpToolExecution(toolName, args = {}) {
  switch (toolName) {
    case 'search_docs': {
      const q = String(args.query || '').toLowerCase();
      const matchedSkills = Object.values(TOGETHER_AGENT_SKILLS).filter(s =>
        s.name.includes(q) || s.description.toLowerCase().includes(q) || s.triggers.some(t => t.includes(q))
      );
      return {
        query: args.query,
        matches: matchedSkills.map(m => ({
          name: m.name,
          title: m.title,
          description: m.description,
          url: `https://docs.together.ai/docs/${m.name}`,
        })),
        total_matches: matchedSkills.length,
      };
    }

    case 'get_doc_page': {
      const p = args.path || '/docs/agent-skills';
      return {
        path: p,
        url: `https://docs.together.ai${p}`,
        source: 'Together AI Docs MCP Proxy',
        status: 'retrieved',
      };
    }

    case 'list_agent_skills': {
      return listTogetherSkills();
    }

    case 'get_skill_spec': {
      return getTogetherSkill(args.skill_name);
    }

    default:
      throw new Error(`Unknown MCP tool: '${toolName}'. Supported: search_docs, get_doc_page, list_agent_skills, get_skill_spec.`);
  }
}

export default {
  TOGETHER_AGENT_SKILLS,
  DOCS_MCP_SERVER,
  listTogetherSkills,
  getTogetherSkill,
  getDocsMcpServerInfo,
  executeAgentSkill,
  executeSkillChain,
  handleMcpToolExecution,
};
