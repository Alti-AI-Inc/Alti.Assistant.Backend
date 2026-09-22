
import Together from 'together-ai';
import config from '../../../config/index.js';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════
//  Together AI — Complete SDK Integration
//  Every single API from https://docs.together.ai/reference
// ═══════════════════════════════════════════════════════════════════════

const llmClient = new Together({
  apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY || 'dummy_key',
});

// ─── 1. CHAT COMPLETIONS ────────────────────────────────────────────
// POST /v1/chat/completions

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
    console.error('Together Chat Error:', error.message);
    throw error;
  }
}

// ─── 2. STREAMING CHAT COMPLETIONS ──────────────────────────────────

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
    console.error('Together Stream Error:', error.message);
    throw error;
  }
}

// ─── 3. TOOL CALLING (FUNCTION CALLING) ─────────────────────────────

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
    console.error('Together ToolCall Error:', error.message);
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
    console.error('Together JSON Chat Error:', error.message);
    throw error;
  }
}

// ─── 5. EMBEDDINGS ──────────────────────────────────────────────────
// POST /v1/embeddings

export async function llmEmbed(input, options = {}) {
  try {
    const response = await llmClient.embeddings.create({
      model: options.model || 'togethercomputer/m2-bert-80M-8k-retrieval',
      input: Array.isArray(input) ? input : [input],
    });
    return Array.isArray(input) ? response.data.map(d => d.embedding) : response.data[0].embedding;
  } catch (error) {
    console.error('Together Embeddings Error:', error.message);
    throw error;
  }
}

// ─── 6. IMAGE GENERATION ────────────────────────────────────────────
// POST /v1/images/generations

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
    console.error('Together Image Generation Error:', error.message);
    throw error;
  }
}

// ─── 7. AUDIO — TEXT-TO-SPEECH (TTS) ────────────────────────────────
// POST /v1/audio/speech

export async function llmTextToSpeech(text, options = {}) {
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
        response_format: options.format || 'mp3',
      }),
    });
    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error('Together TTS Error:', error.message);
    throw error;
  }
}

// ─── 8. AUDIO — SPEECH-TO-TEXT (STT / TRANSCRIPTION) ────────────────
// POST /v1/audio/transcriptions

export async function llmTranscribeAudio(audioFilePath, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fs.createReadStream(audioFilePath));
    form.append('model', options.model || 'openai/whisper-large-v3');
    if (options.language) form.append('language', options.language);

    const response = await fetch('https://api.together.xyz/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });
    if (!response.ok) throw new Error(`STT failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together STT Error:', error.message);
    throw error;
  }
}

// ─── 9. VIDEO GENERATION ────────────────────────────────────────────
// POST /v1/videos/generations

export async function llmGenerateVideo(prompt, options = {}) {
  try {
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
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Together Video Generation Error:', error.message);
    throw error;
  }
}

// ─── 10. CODE INTERPRETER (TCI) ─────────────────────────────────────
// POST /v1/code/interpreter

export async function llmCodeInterpreter(code, options = {}) {
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
// GET /v1/models

export async function llmListModels() {
  try {
    const response = await llmClient.models.list();
    return response;
  } catch (error) {
    console.error('Together List Models Error:', error.message);
    throw error;
  }
}

// ─── 12. FILES — UPLOAD / LIST / GET / DELETE ───────────────────────
// Together Files API for fine-tuning datasets, evals, batch inference

export async function llmUploadFile(filePath, purpose = 'fine-tune') {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('purpose', purpose);

    const response = await fetch('https://api.together.xyz/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });
    if (!response.ok) throw new Error(`File upload failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together File Upload Error:', error.message);
    throw error;
  }
}

export async function llmListFiles() {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/files', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together List Files Error:', error.message);
    throw error;
  }
}

export async function llmGetFile(fileId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Get File Error:', error.message);
    throw error;
  }
}

export async function llmDeleteFile(fileId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Delete File Error:', error.message);
    throw error;
  }
}

// ─── 13. FINE-TUNING — CREATE / LIST / GET / CANCEL ─────────────────

export async function llmCreateFineTune(fileId, model, options = {}) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/fine-tunes', {
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
        suffix: options.suffix || undefined,
      }),
    });
    if (!response.ok) throw new Error(`Fine-tune create failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Together Fine-tune Create Error:', error.message);
    throw error;
  }
}

export async function llmListFineTunes() {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch('https://api.together.xyz/v1/fine-tunes', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together List Fine-tunes Error:', error.message);
    throw error;
  }
}

export async function llmGetFineTune(fineTuneId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/fine-tunes/${fineTuneId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Get Fine-tune Error:', error.message);
    throw error;
  }
}

export async function llmCancelFineTune(fineTuneId) {
  try {
    const apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const response = await fetch(`https://api.together.xyz/v1/fine-tunes/${fineTuneId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return await response.json();
  } catch (error) {
    console.error('Together Cancel Fine-tune Error:', error.message);
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
