
import Together from 'together-ai';
import config from '../../../config/index.js';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════
//  Together AI — Complete Native SDK Integration
//  Using: https://github.com/togethercomputer/together-typescript
//  SDK: together-ai (npm)
//  Every method uses the official Together() client, zero raw fetch
// ═══════════════════════════════════════════════════════════════════════

const llmClient = new Together({
  apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY || 'dummy_key',
  maxRetries: 3,
  timeout: 60 * 1000, // 60s
});

// ─── 1. CHAT COMPLETIONS ────────────────────────────────────────────
// client.chat.completions.create()

export async function llmChat(messages, options = {}) {
  try {
    const response = await llmClient.chat.completions.create({
      model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: options.temperature ?? config.llm?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? undefined,
      top_p: options.topP ?? undefined,
      top_k: options.topK ?? undefined,
      repetition_penalty: options.repetitionPenalty ?? undefined,
      stop: options.stop ?? undefined,
      response_format: options.responseFormat ?? undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Chat ${error.status} ${error.name}:`, error.message);
    }
    throw error;
  }
}

// ─── 2. STREAMING CHAT COMPLETIONS ──────────────────────────────────
// client.chat.completions.create({ stream: true })

export async function llmStream(messages, options = {}) {
  try {
    const stream = await llmClient.chat.completions.create({
      model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: options.temperature ?? config.llm?.temperature ?? 0.7,
      stream: true,
      max_tokens: options.maxTokens ?? undefined,
    });
    return stream;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Stream ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 3. TOOL CALLING (FUNCTION CALLING) ─────────────────────────────
// client.chat.completions.create({ tools })

export async function llmToolCall(messages, tools, options = {}) {
  try {
    const req = {
      model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: options.temperature ?? config.llm?.temperature ?? 0.7,
    };
    if (tools && tools.length > 0) {
      req.tools = tools.map(t => ({ type: 'function', function: t }));
      req.tool_choice = options.toolChoice || 'auto';
    }
    const response = await llmClient.chat.completions.create(req);
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together ToolCall ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 4. JSON MODE / STRUCTURED OUTPUT ───────────────────────────────

export async function llmJsonChat(messages, schema, options = {}) {
  try {
    const response = await llmClient.chat.completions.create({
      model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: options.temperature ?? 0.3,
      response_format: schema
        ? { type: 'json_object', schema }
        : { type: 'json_object' },
    });
    const content = response.choices[0].message.content;
    try { return JSON.parse(content); } catch { return content; }
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together JSON ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 5. EMBEDDINGS ──────────────────────────────────────────────────
// client.embeddings.create()

export async function llmEmbed(input, options = {}) {
  try {
    const response = await llmClient.embeddings.create({
      model: options.model || 'togethercomputer/m2-bert-80M-8k-retrieval',
      input: Array.isArray(input) ? input : [input],
    });
    return Array.isArray(input) ? response.data.map(d => d.embedding) : response.data[0].embedding;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Embed ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 6. IMAGE GENERATION ────────────────────────────────────────────
// client.images.generate()

export async function llmGenerateImage(prompt, options = {}) {
  try {
    const response = await llmClient.images.generate({
      model: options.model || 'black-forest-labs/FLUX.1-schnell-Free',
      prompt,
      steps: options.steps || 4,
      n: options.n || 1,
      height: options.height || 1024,
      width: options.width || 1024,
      seed: options.seed ?? undefined,
      negative_prompt: options.negativePrompt ?? undefined,
    });
    if (options.n && options.n > 1) {
      return response.data.map(d => d.url || d.b64_json);
    }
    return response.data[0].url || response.data[0].b64_json;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Image ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 7. AUDIO — TEXT-TO-SPEECH (TTS) ────────────────────────────────
// client.audio.speech.create()

export async function llmTextToSpeech(text, options = {}) {
  try {
    const response = await llmClient.audio.speech.create({
      model: options.model || 'cartesia/sonic',
      input: text,
      voice: options.voice || 'helpful woman',
      response_format: options.format || 'mp3',
    });
    // SDK returns a Response object — extract buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together TTS ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 8. AUDIO — SPEECH-TO-TEXT (STT / TRANSCRIPTION) ────────────────
// client.audio.transcriptions.create()

export async function llmTranscribeAudio(audioFilePath, options = {}) {
  try {
    const file = fs.createReadStream(audioFilePath);
    const response = await llmClient.audio.transcriptions.create({
      file,
      model: options.model || 'openai/whisper-large-v3',
      language: options.language ?? undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together STT ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 9. VIDEO GENERATION ────────────────────────────────────────────
// client.videos.generations.create()  (if SDK exposes it; fallback to raw)

export async function llmGenerateVideo(prompt, options = {}) {
  try {
    // The SDK may expose client.videos — try native first
    if (llmClient.videos && llmClient.videos.generations) {
      const response = await llmClient.videos.generations.create({
        model: options.model || 'Wan-AI/Wan2.1-T2V-14B',
        prompt,
        height: options.height || 480,
        width: options.width || 832,
        steps: options.steps || 30,
        seed: options.seed ?? undefined,
      });
      return response;
    }
    // Fallback: raw fetch for video generation endpoint
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'Wan-AI/Wan2.1-T2V-14B',
        prompt,
        height: options.height || 480,
        width: options.width || 832,
        steps: options.steps || 30,
        seed: options.seed ?? undefined,
      }),
    });
    if (!response.ok) throw new Error(`Video gen failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Video Error:', error.message);
    throw error;
  }
}

// ─── 10. CODE INTERPRETER (TCI) ─────────────────────────────────────
// Serverless Python sandbox

export async function llmCodeInterpreter(code, options = {}) {
  try {
    // Try native SDK first
    if (llmClient.code && llmClient.code.interpreter) {
      return await llmClient.code.interpreter.create({
        code,
        language: options.language || 'python',
        ...(options.files ? { files: options.files } : {}),
      });
    }
    // Fallback: raw fetch
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/code/interpreter', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language: options.language || 'python',
        ...(options.files ? { files: options.files } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Code interpreter failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Code Interpreter Error:', error.message);
    throw error;
  }
}

// ─── 11. MODELS — LIST ALL ──────────────────────────────────────────
// client.models.list()

export async function llmListModels() {
  try {
    const response = await llmClient.models.list();
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Models ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 12. FILES — UPLOAD / LIST / GET / DELETE ───────────────────────
// client.files.upload() / client.files.list() / client.files.retrieve() / client.files.delete()

export async function llmUploadFile(filePath, purpose = 'fine-tune') {
  try {
    const { toFile } = await import('together-ai');
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const file = await toFile(fileBuffer, fileName);
    const response = await llmClient.files.upload({
      file,
      purpose,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together File Upload ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmListFiles() {
  try {
    return await llmClient.files.list();
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together List Files ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmGetFile(fileId) {
  try {
    return await llmClient.files.retrieve(fileId);
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Get File ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmDeleteFile(fileId) {
  try {
    return await llmClient.files.delete(fileId);
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Delete File ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 13. FINE-TUNING — CREATE / LIST / GET / CANCEL ─────────────────
// client.fineTuning.jobs.create() / .list() / .retrieve() / .cancel()

export async function llmCreateFineTune(fileId, model, options = {}) {
  try {
    const response = await llmClient.fineTuning.jobs.create({
      training_file: fileId,
      model,
      n_epochs: options.epochs || 3,
      learning_rate: options.learningRate || 1e-5,
      batch_size: options.batchSize || 4,
      suffix: options.suffix ?? undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Fine-tune Create ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmListFineTunes() {
  try {
    return await llmClient.fineTuning.jobs.list();
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together List Fine-tunes ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmGetFineTune(fineTuneId) {
  try {
    return await llmClient.fineTuning.jobs.retrieve(fineTuneId);
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Get Fine-tune ${error.status}:`, error.message);
    }
    throw error;
  }
}

export async function llmCancelFineTune(fineTuneId) {
  try {
    return await llmClient.fineTuning.jobs.cancel(fineTuneId);
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Cancel Fine-tune ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 14. WHOAMI — ACCOUNT INFO ──────────────────────────────────────
// client.whoami()

export async function llmWhoami() {
  try {
    return await llmClient.whoami();
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Whoami ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 15. BETA: DEDICATED ENDPOINTS ─────────────────────────────────
// client.beta.endpoints.create() / .retrieve() / .list() / .delete()

export async function llmCreateEndpoint(projectId, params) {
  try {
    return await llmClient.beta.endpoints.create({ ...params, projectId });
  } catch (error) {
    console.error('Together Endpoint Create Error:', error.message);
    throw error;
  }
}

export async function llmListEndpoints(projectId) {
  try {
    return await llmClient.beta.endpoints.list({ projectId });
  } catch (error) {
    console.error('Together Endpoint List Error:', error.message);
    throw error;
  }
}

// ─── 16. BETA: ORGANIZATION USAGE ───────────────────────────────────
// client.beta.organization.usage

export async function llmGetUsage(options = {}) {
  try {
    if (llmClient.beta && llmClient.beta.organization && llmClient.beta.organization.usage) {
      return await llmClient.beta.organization.usage.retrieve(options);
    }
    return { error: 'Usage API not available in current SDK version' };
  } catch (error) {
    console.error('Together Usage Error:', error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════════
//  CONVENIENCE WRAPPERS
// ═══════════════════════════════════════════════════════════════════════

export async function llmComplete(prompt, options = {}) {
  const response = await llmChat([{ role: 'user', content: prompt }], options);
  return response.choices[0].message.content;
}

// Fast / Light model wrappers (8B Turbo)
export async function llmLightChat(messages, options = {}) {
  return llmChat(messages, { ...options, model: options.model || config.llm?.lightModel || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' });
}

export async function llmLightStream(messages, options = {}) {
  return llmStream(messages, { ...options, model: options.model || config.llm?.lightModel || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' });
}

export async function llmLightToolCall(messages, tools, options = {}) {
  return llmToolCall(messages, tools, { ...options, model: options.model || config.llm?.lightModel || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' });
}

export function getLlmClient() {
  return llmClient;
}

export { llmClient };
export default llmClient;
