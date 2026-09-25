/**
 * Aphura Sovereign Together.ai Batch Inference Suite Service
 * Complete Implementation of Together AI Batch Processing across 3 Core Documentation Pages:
 * 
 * 1. Batch Overview: https://docs.together.ai/docs/inference/batch/overview
 *    - Asynchronous batch workloads at up to 50% discount.
 *    - Separate rate limits: up to 50,000 requests/batch, 100MB input file, 10MB/line, 30B enqueued tokens, 24h window.
 *    - Discounted models (50% off): meta-llama/Llama-3.3-70B-Instruct-Turbo, openai/whisper-large-v3.
 *    - Agent skill: together-batch-inference.
 * 2. Batch Tutorial: https://docs.together.ai/docs/inference/batch/tutorial
 *    - 5-step workflow: Prepare JSONL (custom_id, body), Upload (purpose="batch-api"), Create batch, Poll completion, Retrieve results.
 *    - Audio batch: method="FILE", body.file URL, /v1/audio/transcriptions endpoint.
 * 3. Batch Manage:   https://docs.together.ai/docs/inference/batch/manage
 *    - Status checking, output_file_id & error_file_id downloading, cancellation, listing, error code reference.
 * 
 * License: MIT
 */

import {
  llmCreateBatch,
  llmListBatches,
  llmGetBatch,
  llmCancelBatch,
} from './llm.client.js';

// ── 1. Catalogs & Constants ──────────────────────────────────────────────────

export const BATCH_LIMITS = {
  max_requests_per_batch: 50000,
  max_input_file_size_mb: 100,
  max_line_size_mb: 10,
  max_enqueued_tokens_per_model: 30000000000, // 30B tokens
  completion_window_hours: 24,
  completion_window: '24h',
  discount_rate: '50%',
  recommended_batch_size: '1,000 to 10,000 requests',
};

export const BATCH_SUPPORTED_ENDPOINTS = [
  {
    endpoint: '/v1/chat/completions',
    cli_alias: 'chat.completions',
    description: 'Chat completions batch processing (messages, model, max_tokens, temperature).',
    requires_file_method: false,
  },
  {
    endpoint: '/v1/audio/transcriptions',
    cli_alias: 'audio.transcriptions',
    description: 'Audio transcription batch processing (Whisper). Requires method="FILE" and body.file URL.',
    requires_file_method: true,
  },
  {
    endpoint: '/v1/audio/translations',
    cli_alias: 'audio.translations',
    description: 'Audio translation to English batch processing. Requires method="FILE" and body.file URL.',
    requires_file_method: true,
  },
  {
    endpoint: '/v1/completions',
    cli_alias: 'completions',
    description: 'Legacy text completion batch processing.',
    requires_file_method: false,
  },
];

export const BATCH_DISCOUNTED_MODELS = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    name: 'Meta Llama 3.3 70B Instruct Turbo',
    discount: '50% off standard serverless rates',
    endpoint: '/v1/chat/completions',
  },
  {
    id: 'openai/whisper-large-v3',
    name: 'OpenAI Whisper Large v3',
    discount: '50% off standard serverless rates',
    endpoint: '/v1/audio/transcriptions',
  },
];

export const BATCH_STATUSES = {
  VALIDATING: 'The input file is being validated before the batch can begin.',
  IN_PROGRESS: 'Requests are being processed.',
  COMPLETED: 'All requests processed; results available.',
  FAILED: 'Processing failed.',
  EXPIRED: 'The job exceeded its time limit.',
  CANCELLED: 'The job was cancelled.',
};

// ── 2. Documentation Getters ─────────────────────────────────────────────────

export function getBatchOverview() {
  return {
    success: true,
    title: 'Together AI Batch Processing Overview',
    docs_url: 'https://docs.together.ai/docs/inference/batch/overview',
    discount: 'Up to 50% discount on selected models',
    discounted_models: BATCH_DISCOUNTED_MODELS,
    rate_limits: BATCH_LIMITS,
    supported_endpoints: BATCH_SUPPORTED_ENDPOINTS,
    statuses: BATCH_STATUSES,
    best_practices: [
      'Aim for 1,000 to 10,000 requests per batch for optimal throughput.',
      'Keep custom_id values stable and unique (up to 64 chars) to reconcile inputs, outputs, and errors.',
      'For classification, set max_tokens=4 and temperature=0 to minimize output token costs.',
      'Validate JSONL syntax locally before uploading (malformed files fail the batch in VALIDATING).',
      'Always inspect the error file (error_file_id) even when status is COMPLETED.',
    ],
    agent_skill: 'together-batch-inference',
  };
}

export function getBatchTutorialDocs() {
  return {
    success: true,
    title: 'Together AI Batch Processing Tutorial',
    docs_url: 'https://docs.together.ai/docs/inference/batch/tutorial',
    workflow_steps: [
      { step: 1, action: 'Prepare JSONL input file', description: 'Each line contains custom_id (up to 64 chars) and body. Audio adds method="FILE".' },
      { step: 2, action: 'Upload file', description: 'Upload JSONL with purpose="batch-api" via files API or tg batches submit.' },
      { step: 3, action: 'Create batch', description: 'POST /v1/batches with input_file_id and endpoint (/v1/chat/completions or /v1/audio/transcriptions).' },
      { step: 4, action: 'Poll for completion', description: 'Poll status every 30-60 seconds until COMPLETED, FAILED, EXPIRED, or CANCELLED.' },
      { step: 5, action: 'Retrieve results', description: 'Download output_file_id (results) and error_file_id (per-request errors).' },
    ],
    code_snippets: {
      cli_submit: `tg batches submit batch_input.jsonl --api chat.completions`,
      cli_poll: `tg batches get <BATCH_ID>`,
      cli_download: `tg batches download <BATCH_ID> --output batch_output.jsonl`,
      python_end_to_end: `from together import Together
client = Together()

# 1. Upload
file_resp = client.files.upload(file="batch_input.jsonl", purpose="batch-api", check=False)

# 2. Create Batch
response = client.batches.create(
    input_file_id=file_resp.id,
    endpoint="/v1/chat/completions",
)
batch_id = response.job.id

# 3. Poll
import time
while True:
    batch = client.batches.retrieve(batch_id)
    if batch.status in ("COMPLETED", "FAILED", "EXPIRED", "CANCELLED"):
        break
    time.sleep(30)

# 4. Download
if batch.output_file_id:
    content = client.files.content(batch.output_file_id)
    content.write_to_file("batch_output.jsonl")`,
      audio_batch_jsonl: `{"custom_id": "transcription-1", "method": "FILE", "body": {"file": "https://example.com/clip-1.wav", "model": "openai/whisper-large-v3"}}`,
    },
  };
}

export function getBatchManageDocs() {
  return {
    success: true,
    title: 'Together AI Manage Batch Jobs Reference',
    docs_url: 'https://docs.together.ai/docs/inference/batch/manage',
    endpoints: {
      create_batch: 'POST https://api.together.ai/v1/batches',
      retrieve_batch: 'GET https://api.together.ai/v1/batches/{id}',
      cancel_batch: 'POST https://api.together.ai/v1/batches/{id}/cancel',
      list_batches: 'GET https://api.together.ai/v1/batches',
    },
    error_codes: [
      { code: 400, description: 'Invalid request format. Check JSONL syntax and required fields.' },
      { code: 401, description: 'Authentication failed. Verify TOGETHER_API_KEY.' },
      { code: 404, description: 'Batch not found. Verify batch ID.' },
      { code: 429, description: 'Rate limit exceeded. Reduce request frequency or poll interval.' },
      { code: 500, description: 'Server error. Retry with exponential backoff.' },
    ],
    error_file_format: {
      schema: '{"custom_id": string, "error": {"message": string, "code": string}}',
      example: '{"custom_id": "req-1", "error": {"message": "Invalid model specified", "code": "invalid_model"}}',
    },
  };
}

// ── 3. Validation Logic ──────────────────────────────────────────────────────

/**
 * Validates batch creation parameters against official Together rules
 */
export function validateBatchRequest(payload = {}) {
  const errors = [];
  const warnings = [];

  const { input_file_id, endpoint = '/v1/chat/completions', completion_window = '24h' } = payload;

  if (!input_file_id || typeof input_file_id !== 'string') {
    errors.push('Missing required parameter: "input_file_id".');
  }

  const validEndpoints = BATCH_SUPPORTED_ENDPOINTS.map(e => e.endpoint);
  if (!endpoint || !validEndpoints.includes(endpoint)) {
    errors.push(`Invalid endpoint: '${endpoint}'. Supported endpoints: ${validEndpoints.join(', ')}.`);
  }

  if (completion_window && completion_window !== '24h') {
    warnings.push(`Completion window '${completion_window}' is fixed to '24h' on Together AI.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    input_file_id,
    endpoint,
    completion_window: '24h',
  };
}

/**
 * Validates a single line of a batch JSONL file
 */
export function validateBatchJsonlLine(line, endpoint = '/v1/chat/completions') {
  const errors = [];

  let parsed = line;
  if (typeof line === 'string') {
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      return { valid: false, errors: ['Line is not valid JSON.'] };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Batch request line must be a JSON object.'] };
  }

  if (!parsed.custom_id || typeof parsed.custom_id !== 'string') {
    errors.push('Missing required "custom_id" string.');
  } else if (parsed.custom_id.length > 64) {
    errors.push(`"custom_id" exceeds 64 characters (${parsed.custom_id.length} chars).`);
  }

  if (!parsed.body || typeof parsed.body !== 'object') {
    errors.push('Missing required "body" object.');
  }

  // Audio endpoint requires method="FILE" and body.file
  const isAudio = endpoint.includes('/audio/');
  if (isAudio) {
    if (parsed.method !== 'FILE') {
      errors.push('Audio batch requests must specify "method": "FILE" to use multipart/form-data.');
    }
    if (!parsed.body?.file) {
      errors.push('Audio batch requests must provide a reachable URL in "body.file".');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    custom_id: parsed.custom_id,
  };
}

/**
 * Validates an entire batch dataset (array of lines or JSON objects)
 */
export function validateBatchInputDataset(records = [], endpoint = '/v1/chat/completions') {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(records) || records.length === 0) {
    return { valid: false, errors: ['Dataset must be a non-empty array of batch request records.'] };
  }

  if (records.length > BATCH_LIMITS.max_requests_per_batch) {
    errors.push(`Dataset contains ${records.length} requests, exceeding max limit of ${BATCH_LIMITS.max_requests_per_batch}.`);
  }

  const seenIds = new Set();
  const duplicateIds = new Set();

  records.forEach((rec, idx) => {
    const lineValidation = validateBatchJsonlLine(rec, endpoint);
    if (!lineValidation.valid) {
      errors.push(`Line ${idx + 1}: ${lineValidation.errors.join('; ')}`);
    }
    if (lineValidation.custom_id) {
      if (seenIds.has(lineValidation.custom_id)) {
        duplicateIds.add(lineValidation.custom_id);
      }
      seenIds.add(lineValidation.custom_id);
    }
  });

  if (duplicateIds.size > 0) {
    errors.push(`Duplicate custom_id values found: [${Array.from(duplicateIds).slice(0, 5).join(', ')}]. custom_id must be unique across the batch.`);
  }

  if (records.length < 1000) {
    warnings.push(`Batch size (${records.length}) is below recommended range (1,000 - 10,000 requests). Smaller batches waste per-job overhead.`);
  }

  return {
    valid: errors.length === 0,
    total_records: records.length,
    unique_ids: seenIds.size,
    errors,
    warnings,
  };
}

// ── 4. Execution Dispatchers ─────────────────────────────────────────────────

export async function createBatchJob(payload = {}) {
  const validation = validateBatchRequest(payload);
  if (!validation.valid) {
    const error = new Error(`Validation failed: ${validation.errors.join('; ')}`);
    error.statusCode = 400;
    error.errors = validation.errors;
    throw error;
  }
  return llmCreateBatch(payload);
}

export async function getBatchJob(batchId) {
  if (!batchId) throw new Error('Missing required batchId.');
  return llmGetBatch(batchId);
}

export async function listBatchJobs(query = {}) {
  return llmListBatches(query);
}

export async function cancelBatchJob(batchId) {
  if (!batchId) throw new Error('Missing required batchId.');
  return llmCancelBatch(batchId);
}

export default {
  BATCH_LIMITS,
  BATCH_SUPPORTED_ENDPOINTS,
  BATCH_DISCOUNTED_MODELS,
  BATCH_STATUSES,
  getBatchOverview,
  getBatchTutorialDocs,
  getBatchManageDocs,
  validateBatchRequest,
  validateBatchJsonlLine,
  validateBatchInputDataset,
  createBatchJob,
  getBatchJob,
  listBatchJobs,
  cancelBatchJob,
};
