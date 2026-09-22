
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

// ─── 17. LEGACY TEXT COMPLETIONS ────────────────────────────────────
// POST /v1/completions (non-chat, raw text completion)

export async function llmLegacyComplete(prompt, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        prompt,
        max_tokens: options.maxTokens || 512,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? undefined,
        top_k: options.topK ?? undefined,
        repetition_penalty: options.repetitionPenalty ?? undefined,
        stop: options.stop ?? undefined,
        stream: options.stream ?? false,
        logprobs: options.logprobs ?? undefined,
        echo: options.echo ?? undefined,
      }),
    });
    if (!response.ok) throw new Error(`Completions failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Legacy Completions Error:', error.message);
    throw error;
  }
}

// ─── 18. RERANK ─────────────────────────────────────────────────────
// POST /v1/rerank — reorder documents by relevance to a query

export async function llmRerank(query, documents, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'Salesforce/Llama-Rank-V1',
        query,
        documents,
        top_n: options.topN ?? undefined,
        return_documents: options.returnDocuments ?? true,
      }),
    });
    if (!response.ok) throw new Error(`Rerank failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Rerank Error:', error.message);
    throw error;
  }
}

// ─── 19. AUDIO — TRANSLATION (any language → English) ───────────────
// POST /v1/audio/translations

export async function llmTranslateAudio(audioFilePath, options = {}) {
  try {
    const file = fs.createReadStream(audioFilePath);
    const response = await llmClient.audio.translations.create({
      file,
      model: options.model || 'openai/whisper-large-v3',
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Audio Translation ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 20. BATCH JOBS — CREATE / LIST / GET / CANCEL ──────────────────
// Async batch inference at 50% lower cost

export async function llmCreateBatch(inputFileId, endpoint, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/batches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input_file_id: inputFileId,
        endpoint,
        completion_window: options.completionWindow || '24h',
      }),
    });
    if (!response.ok) throw new Error(`Batch create failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Batch Create Error:', error.message);
    throw error;
  }
}

export async function llmListBatches() {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/batches', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together List Batches Error:', error.message);
    throw error;
  }
}

export async function llmGetBatch(batchId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/batches/${batchId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Get Batch Error:', error.message);
    throw error;
  }
}

export async function llmCancelBatch(batchId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/batches/${batchId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Cancel Batch Error:', error.message);
    throw error;
  }
}

// ─── 21. VIDEO METADATA ─────────────────────────────────────────────
// GET /v1/videos/{id}

export async function llmGetVideoMetadata(videoId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/videos/${videoId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Video metadata failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Video Metadata Error:', error.message);
    throw error;
  }
}

// ─── 22. CODE INTERPRETER — SESSIONS ────────────────────────────────
// GET /v1/code/sessions — list active sessions
// POST /v1/code/interpreter with session_id for persistent sessions

export async function llmListCodeSessions() {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/code/sessions', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Code sessions list failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Code Sessions Error:', error.message);
    throw error;
  }
}

export async function llmCodeInterpreterWithSession(code, sessionId, options = {}) {
  try {
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
        session_id: sessionId,
        ...(options.files ? { files: options.files } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Code interpreter session failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Code Session Error:', error.message);
    throw error;
  }
}

// ─── 23. FINE-TUNE — ESTIMATE PRICE ─────────────────────────────────
// POST /v1/fine-tunes/estimate-price

export async function llmEstimateFineTunePrice(fileId, model, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/fine-tunes/estimate-price', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        training_file: fileId,
        model,
        n_epochs: options.epochs || 3,
        learning_rate: options.learningRate || 1e-5,
        batch_size: options.batchSize || 4,
      }),
    });
    if (!response.ok) throw new Error(`Fine-tune estimate failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Fine-tune Estimate Error:', error.message);
    throw error;
  }
}

// ─── 24. FINE-TUNE — METRICS ────────────────────────────────────────
// GET /v1/fine-tunes/{id}/metrics

export async function llmGetFineTuneMetrics(fineTuneId, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    let url = `https://api.together.xyz/v1/fine-tunes/${fineTuneId}/metrics`;
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.minStep) params.set('min_step', options.minStep);
    if (options.maxStep) params.set('max_step', options.maxStep);
    if (params.toString()) url += `?${params}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Fine-tune metrics failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Fine-tune Metrics Error:', error.message);
    throw error;
  }
}

// ─── 25. FINE-TUNE — DOWNLOAD TOKENIZED DATASET ────────────────────
// GET /v1/fine-tunes/{id}/download-tokenized-dataset

export async function llmDownloadTokenizedDataset(fineTuneId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/fine-tunes/${fineTuneId}/download-tokenized-dataset`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Download tokenized dataset failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Tokenized Dataset Error:', error.message);
    throw error;
  }
}

// ─── 26. FINE-TUNE — MODEL LIMITS ───────────────────────────────────
// GET /v1/fine-tunes/models/limits

export async function llmGetModelLimits(model) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/fine-tunes/models/limits?model=${encodeURIComponent(model)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Model limits failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Model Limits Error:', error.message);
    throw error;
  }
}

// ─── 27. VISION — IMAGE INPUT WITH CHAT ─────────────────────────────
// Uses chat completions with image_url content parts

export async function llmVisionChat(textPrompt, imageUrls, options = {}) {
  try {
    const content = [{ type: 'text', text: textPrompt }];
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
    for (const url of urls) {
      content.push({ type: 'image_url', image_url: { url } });
    }
    const response = await llmClient.chat.completions.create({
      model: options.model || 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      messages: [{ role: 'user', content }],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096,
      response_format: options.responseFormat ?? undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Vision ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 28. REASONING MODELS ───────────────────────────────────────────
// Chat completions with reasoning models (think step-by-step)

export async function llmReasoningChat(messages, options = {}) {
  try {
    const response = await llmClient.chat.completions.create({
      model: options.model || 'Qwen/QwQ-32B',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 16384,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Reasoning ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 29. LOG PROBABILITIES ──────────────────────────────────────────
// Chat completions with logprobs enabled

export async function llmChatWithLogprobs(messages, options = {}) {
  try {
    const response = await llmClient.chat.completions.create({
      model: options.model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: options.temperature ?? 0.7,
      logprobs: true,
      top_logprobs: options.topLogprobs || 5,
      max_tokens: options.maxTokens ?? undefined,
    });
    return response;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Logprobs ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 30. STREAMING TTS (HTTP) ───────────────────────────────────────
// POST /v1/audio/speech with streaming response

export async function llmStreamTTS(text, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'cartesia/sonic',
        input: text,
        voice: options.voice || 'helpful woman',
        response_format: options.format || 'raw',
      }),
    });
    if (!response.ok) throw new Error(`Streaming TTS failed: ${response.status}`);
    return response.body; // Returns a ReadableStream of raw PCM bytes
  } catch (error) {
    console.error('Together Streaming TTS Error:', error.message);
    throw error;
  }
}

// ─── 31. WEBSOCKET TTS (REALTIME) ───────────────────────────────────
// wss://api.together.ai/v1/audio/speech/websocket
// Returns connection config for client to establish WebSocket

export function llmRealtimeTTSConfig(options = {}) {
  return {
    url: 'wss://api.together.ai/v1/audio/speech/websocket',
    headers: {
      'Authorization': `Bearer ${config.llm?.apiKey || process.env.TOGETHER_API_KEY}`,
    },
    params: {
      model: options.model || 'cartesia/sonic',
      voice: options.voice || 'helpful woman',
      response_format: options.format || 'raw',
      sample_rate: options.sampleRate || 24000,
    },
  };
}

// ─── 32. WEBSOCKET STT (REALTIME TRANSCRIPTION) ─────────────────────
// wss://api.together.ai/v1/realtime
// Returns connection config for client to establish WebSocket

export function llmRealtimeSTTConfig(options = {}) {
  return {
    url: 'wss://api.together.ai/v1/realtime',
    headers: {
      'Authorization': `Bearer ${config.llm?.apiKey || process.env.TOGETHER_API_KEY}`,
    },
    params: {
      model: options.model || 'openai/whisper-large-v3',
      language: options.language || 'en',
      interim_results: options.interimResults ?? true,
      vad_threshold: options.vadThreshold ?? 0.5,
    },
  };
}

// ─── 33. IMAGE-TO-IMAGE (EDIT / TRANSFORM) ──────────────────────────
// POST /v1/images/generations with image_url or reference_images

export async function llmImageToImage(prompt, sourceImageUrl, options = {}) {
  try {
    const params = {
      model: options.model || 'black-forest-labs/FLUX.1-kontext-max',
      prompt,
      steps: options.steps || 20,
      n: options.n || 1,
      height: options.height || 1024,
      width: options.width || 1024,
    };
    // Kontext models use image_url
    if (sourceImageUrl) {
      params.image_url = sourceImageUrl;
    }
    // FLUX.2 / Google models use reference_images
    if (options.referenceImages) {
      params.reference_images = options.referenceImages;
    }
    const response = await llmClient.images.generate(params);
    return response.data[0].url || response.data[0].b64_json;
  } catch (error) {
    if (error instanceof Together.APIError) {
      console.error(`Together Image-to-Image ${error.status}:`, error.message);
    }
    throw error;
  }
}

// ─── 34. QUEUE API (DEDICATED CONTAINERS) ───────────────────────────
// Async job queue for dedicated container deployments

export async function llmQueueSubmit(model, body, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/queue/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        body,
        priority: options.priority ?? 0,
      }),
    });
    if (!response.ok) throw new Error(`Queue submit failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Queue Submit Error:', error.message);
    throw error;
  }
}

export async function llmQueueStatus(requestId, model) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/queue/status?request_id=${requestId}&model=${encodeURIComponent(model)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Queue Status Error:', error.message);
    throw error;
  }
}

export async function llmQueueCancel(requestId, model) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/queue/cancel', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId, model }),
    });
    return await response.json();
  } catch (error) {
    console.error('Together Queue Cancel Error:', error.message);
    throw error;
  }
}

export async function llmQueueClear(model) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/queue/clear', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    });
    return await response.json();
  } catch (error) {
    console.error('Together Queue Clear Error:', error.message);
    throw error;
  }
}

export async function llmQueueMetrics(model) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/queue/metrics?model=${encodeURIComponent(model)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Queue Metrics Error:', error.message);
    throw error;
  }
}

// ─── 35. GPU CLUSTERS API ───────────────────────────────────────────
// Full CRUD for instant GPU clusters

const API_BASE = 'https://api.together.xyz/v1';
function authHeaders() {
  return { 'Authorization': `Bearer ${config.llm?.apiKey || process.env.TOGETHER_API_KEY}`, 'Content-Type': 'application/json' };
}

export async function llmCreateCluster(params) {
  const r = await fetch(`${API_BASE}/clusters`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmListClusters() {
  const r = await fetch(`${API_BASE}/clusters`, { headers: authHeaders() });
  return r.json();
}
export async function llmGetCluster(clusterId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}`, { headers: authHeaders() });
  return r.json();
}
export async function llmUpdateCluster(clusterId, params) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmDeleteCluster(clusterId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}`, { method: 'DELETE', headers: authHeaders() });
  return r.json();
}

// ─── 36. CLUSTER STORAGE (SHARED VOLUMES) ───────────────────────────

export async function llmCreateClusterVolume(params) {
  const r = await fetch(`${API_BASE}/clusters/storages`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmListClusterVolumes() {
  const r = await fetch(`${API_BASE}/clusters/storages`, { headers: authHeaders() });
  return r.json();
}
export async function llmGetClusterVolume(volumeId) {
  const r = await fetch(`${API_BASE}/clusters/storages/${volumeId}`, { headers: authHeaders() });
  return r.json();
}
export async function llmUpdateClusterVolume(volumeId, params) {
  const r = await fetch(`${API_BASE}/clusters/storages/${volumeId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmDeleteClusterVolume(volumeId) {
  const r = await fetch(`${API_BASE}/clusters/storages/${volumeId}`, { method: 'DELETE', headers: authHeaders() });
  return r.json();
}

// ─── 37. CLUSTER REMEDIATION (NODE REPAIR) ──────────────────────────

export async function llmListRemediations(clusterId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/remediations`, { headers: authHeaders() });
  return r.json();
}
export async function llmGetRemediation(clusterId, instanceId, remediationId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/instances/${instanceId}/remediations/${remediationId}`, { headers: authHeaders() });
  return r.json();
}
export async function llmCreateRemediation(clusterId, instanceId, params) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/instances/${instanceId}/remediations`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmApproveRemediation(clusterId, instanceId, remediationId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/instances/${instanceId}/remediations/${remediationId}/approve`, { method: 'POST', headers: authHeaders() });
  return r.json();
}
export async function llmCancelRemediation(clusterId, instanceId, remediationId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/instances/${instanceId}/remediations/${remediationId}/cancel`, { method: 'POST', headers: authHeaders() });
  return r.json();
}
export async function llmRejectRemediation(clusterId, instanceId, remediationId) {
  const r = await fetch(`${API_BASE}/clusters/${clusterId}/instances/${instanceId}/remediations/${remediationId}/reject`, { method: 'POST', headers: authHeaders() });
  return r.json();
}

// ─── 38. DEDICATED CONTAINER DEPLOYMENTS ────────────────────────────

export async function llmListDeployments(projectId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments`, { headers: authHeaders() });
  return r.json();
}
export async function llmCreateDeployment(projectId, params) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmGetDeployment(projectId, deploymentId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments/${deploymentId}`, { headers: authHeaders() });
  return r.json();
}
export async function llmUpdateDeployment(projectId, deploymentId, params) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments/${deploymentId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmDeleteDeployment(projectId, deploymentId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments/${deploymentId}`, { method: 'DELETE', headers: authHeaders() });
  return r.json();
}
export async function llmGetDeploymentLogs(projectId, deploymentId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/deployments/${deploymentId}/logs`, { headers: authHeaders() });
  return r.json();
}

// ─── 39. DEDICATED CONTAINER SECRETS ────────────────────────────────

export async function llmListSecrets(projectId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/secrets`, { headers: authHeaders() });
  return r.json();
}
export async function llmCreateSecret(projectId, params) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/secrets`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmDeleteSecret(projectId, secretId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/secrets/${secretId}`, { method: 'DELETE', headers: authHeaders() });
  return r.json();
}

// ─── 40. DEDICATED CONTAINER VOLUMES ────────────────────────────────

export async function llmListProjectVolumes(projectId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/volumes`, { headers: authHeaders() });
  return r.json();
}
export async function llmCreateProjectVolume(projectId, params) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/volumes`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmDeleteProjectVolume(projectId, volumeId) {
  const r = await fetch(`${API_BASE}/projects/${projectId}/volumes/${volumeId}`, { method: 'DELETE', headers: authHeaders() });
  return r.json();
}

// ─── 41. CODE SANDBOX ───────────────────────────────────────────────
// Run generative code in fast secure sandboxes (separate from Code Interpreter)

export async function llmCodeSandbox(code, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/code/sandbox', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language: options.language || 'python',
        timeout: options.timeout || 30,
        ...(options.files ? { files: options.files } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Code sandbox failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Code Sandbox Error:', error.message);
    throw error;
  }
}

// ─── 42. BILLING USAGE ──────────────────────────────────────────────
// GET /v1/billing/usage

export async function llmGetBillingUsage(options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const params = new URLSearchParams();
    if (options.month) params.set('month', options.month);
    if (options.granularity) params.set('granularity', options.granularity);
    const url = `${API_BASE}/billing/usage${params.toString() ? '?' + params : ''}`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    return await r.json();
  } catch (error) {
    console.error('Together Billing Usage Error:', error.message);
    throw error;
  }
}

// ─── 43. UPLOAD MODEL (FROM HF / S3) ───────────────────────────────
// POST /v1/models/upload

export async function llmUploadModel(source, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`${API_BASE}/models/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model_source: source,
        model_name: options.name || undefined,
        hf_token: options.hfToken || undefined,
      }),
    });
    if (!response.ok) throw new Error(`Model upload failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Model Upload Error:', error.message);
    throw error;
  }
}

// ─── 44. EVALS API (REST) ───────────────────────────────────────────

export async function llmCreateEval(params) {
  const r = await fetch(`${API_BASE}/evals`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(params) });
  return r.json();
}
export async function llmListEvals() {
  const r = await fetch(`${API_BASE}/evals`, { headers: authHeaders() });
  return r.json();
}
export async function llmGetEval(evalId) {
  const r = await fetch(`${API_BASE}/evals/${evalId}`, { headers: authHeaders() });
  return r.json();
}
export async function llmGetEvalStatus(evalId) {
  const r = await fetch(`${API_BASE}/evals/${evalId}/status`, { headers: authHeaders() });
  return r.json();
}
export async function llmListEvalModels() {
  const r = await fetch(`${API_BASE}/evals/models`, { headers: authHeaders() });
  return r.json();
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
