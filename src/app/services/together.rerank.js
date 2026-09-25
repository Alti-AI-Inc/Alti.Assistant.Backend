/**
 * Aphura Sovereign Together.ai Rerank & Embeddings Inference Suite Service
 * Complete Implementation of Together AI Rerank and Embeddings:
 * 
 * 1. Rerank Overview & API:    https://docs.together.ai/docs/inference/embeddings/rerank
 *    - Reorders retrieved documents by relevance to a query for sharper search and RAG results.
 *    - Cross-encoder reranking, 8K context per document, low latency.
 *    - Models: mixedbread-ai/mxbai-rerank-large-v2, Salesforce/Llama-Rank-V1, salesforce/turboranker-0.8-3778-6328.
 *    - Structured JSON document ranking with rank_fields.
 * 2. Embeddings Overview & API: https://docs.together.ai/reference/embeddings
 *    - Dense vector representation of text inputs for semantic similarity, classification, and vector indexing.
 *    - Models: BAAI/bge-large-en-v1.5, togethercomputer/m2-bert-80M-8k-retrieval, sentence-transformers/msmarco-bert-base-dot-v5.
 * 
 * License: MIT
 */

import { llmRerank, llmCreateEmbeddings } from './llm.client.js';

// ── 1. Models Catalog ────────────────────────────────────────────────────────

export const RERANK_MODELS_CATALOG = [
  {
    id: 'mixedbread-ai/mxbai-rerank-large-v2',
    name: 'MixedBread AI Rerank Large v2',
    type: 'High-Accuracy Text Cross-Encoder Reranker',
    context_length: 8192,
    latency_tier: 'ultra-low',
    supports_structured_json: false,
    recommended_for: 'Flagship search re-ranking, RAG quality filtering, 8k long document scoring.',
    deployment: 'dedicated_or_serverless',
  },
  {
    id: 'Salesforce/Llama-Rank-V1',
    name: 'Salesforce Llama-Rank-V1',
    type: 'Structured Multi-Field JSON Cross-Encoder Reranker',
    context_length: 8192,
    latency_tier: 'low',
    supports_structured_json: true,
    supported_rank_fields: ['from', 'to', 'date', 'subject', 'text', 'title', 'content'],
    recommended_for: 'Multi-field JSON document ranking (e.g. emails, customer support tickets, ERP records).',
    deployment: 'dedicated',
  },
  {
    id: 'salesforce/turboranker-0.8-3778-6328',
    name: 'Salesforce TurboRanker 0.8',
    type: 'Ultra-Low Latency Turbo Reranker',
    context_length: 4096,
    latency_tier: 'realtime',
    supports_structured_json: true,
    recommended_for: 'High-throughput real-time ecommerce and search query re-ranking.',
    deployment: 'dedicated',
  },
  {
    id: 'BAAI/bge-reranker-large',
    name: 'BAAI BGE Reranker Large',
    type: 'Open Source Dense Cross-Encoder',
    context_length: 512,
    latency_tier: 'low',
    supports_structured_json: false,
    recommended_for: 'Fast semantic passage and sentence re-ranking.',
    deployment: 'serverless',
  },
  {
    id: 'BAAI/bge-reranker-v2-m3',
    name: 'BAAI BGE Reranker v2 M3',
    type: 'Multilingual Cross-Encoder',
    context_length: 8192,
    latency_tier: 'low',
    supports_structured_json: false,
    recommended_for: 'Cross-lingual and multi-language document re-ranking across 100+ languages.',
    deployment: 'serverless',
  },
];

export const EMBEDDING_MODELS_CATALOG = [
  {
    id: 'BAAI/bge-large-en-v1.5',
    name: 'BAAI BGE Large EN v1.5',
    dimensions: 1024,
    context_length: 512,
    recommended_for: 'Flagship general English semantic retrieval and vector databases.',
  },
  {
    id: 'BAAI/bge-base-en-v1.5',
    name: 'BAAI BGE Base EN v1.5',
    dimensions: 768,
    context_length: 512,
    recommended_for: 'High-speed vector representations and real-time similarity checks.',
  },
  {
    id: 'togethercomputer/m2-bert-80M-8k-retrieval',
    name: 'Together M2-BERT 80M 8K Retrieval',
    dimensions: 768,
    context_length: 8192,
    recommended_for: 'Long-context document embedding (up to 8,192 tokens per document chunk).',
  },
  {
    id: 'togethercomputer/m2-bert-80M-32k-retrieval',
    name: 'Together M2-BERT 80M 32K Retrieval',
    dimensions: 1024,
    context_length: 32768,
    recommended_for: 'Ultra-long document and whole-book embedding vectors (up to 32k tokens).',
  },
  {
    id: 'sentence-transformers/msmarco-bert-base-dot-v5',
    name: 'SentenceTransformers MS MARCO BERT Base',
    dimensions: 768,
    context_length: 512,
    recommended_for: 'Information retrieval specifically fine-tuned on MS MARCO search queries.',
  },
];

// ── 2. Overview Documentation ────────────────────────────────────────────────

export function getRerankOverview() {
  return {
    success: true,
    title: 'Together AI Rerank & Embeddings Inference Suite',
    docs_url: 'https://docs.together.ai/docs/inference/embeddings/rerank',
    endpoint: 'POST https://api.together.ai/v1/rerank',
    recommended_model: 'mixedbread-ai/mxbai-rerank-large-v2',
    structured_json_model: 'Salesforce/Llama-Rank-V1',
    models: RERANK_MODELS_CATALOG,
    embedding_models: EMBEDDING_MODELS_CATALOG,
    pipeline_architecture: {
      step_1: 'Initial Retrieval: Vector search (ANN) or BM25 keyword search retrieves Top 20-100 candidates.',
      step_2: 'Cross-Encoder Rerank: Together AI Rerank API calculates deep joint attention between query and each candidate.',
      step_3: 'Quality Filter: Top N (e.g. top 3-5) most relevant documents are passed to LLM generation.',
    },
    parameters_reference: [
      { name: 'model', type: 'string', required: true, description: 'The reranker model (e.g. mixedbread-ai/mxbai-rerank-large-v2 or Salesforce/Llama-Rank-V1).' },
      { name: 'query', type: 'string', required: true, description: 'The search query or user question.' },
      { name: 'documents', type: 'array', required: true, description: 'List of text strings or list of JSON objects to score.' },
      { name: 'top_n', type: 'integer', required: false, description: 'Number of most relevant documents to return in results.' },
      { name: 'return_documents', type: 'boolean', required: false, default: true, description: 'Whether to include document contents in results array.' },
      { name: 'rank_fields', type: 'array of strings', required: false, description: 'Keys to consider and order when ranking JSON objects (e.g. ["from", "to", "date", "subject", "text"]).' },
    ],
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.rerank.create(
    model="mixedbread-ai/mxbai-rerank-large-v2",
    query="What animals can I find near Peru?",
    documents=[
        "The giant panda is a bear species endemic to China.",
        "The llama is a domesticated South American camelid widely used in Andean cultures.",
        "The guanaco is a camelid native to South America, closely related to the llama.",
        "The wild Bactrian camel is endemic to Northwest China and Mongolia."
    ],
    top_n=2,
    return_documents=True,
)
for res in response.results:
    print(f"Rank {res.index + 1}: Score {res.relevance_score} - {res.document['text']}")`,
      typescript: `import Together from 'together-ai';
const client = new Together();

const response = await client.rerank.create({
  model: 'mixedbread-ai/mxbai-rerank-large-v2',
  query: 'What animals can I find near Peru?',
  documents: [
    'The giant panda is a bear species endemic to China.',
    'The llama is a domesticated South American camelid widely used in Andean cultures.',
    'The guanaco is a camelid native to South America, closely related to the llama.',
    'The wild Bactrian camel is endemic to Northwest China and Mongolia.'
  ],
  top_n: 2,
  return_documents: true,
});
console.log(response.results);`,
      curl: `curl -X POST "https://api.together.ai/v1/rerank" \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "mixedbread-ai/mxbai-rerank-large-v2",
    "query": "What animals can I find near Peru?",
    "documents": [
      "The giant panda is a bear species endemic to China.",
      "The llama is a domesticated South American camelid widely used in Andean cultures."
    ],
    "top_n": 2,
    "return_documents": true
  }'`,
    },
  };
}

export function getEmbeddingsOverview() {
  return {
    success: true,
    title: 'Together AI Embeddings Inference Suite',
    docs_url: 'https://docs.together.ai/reference/embeddings',
    endpoint: 'POST https://api.together.ai/v1/embeddings',
    recommended_model: 'BAAI/bge-large-en-v1.5',
    models: EMBEDDING_MODELS_CATALOG,
    parameters_reference: [
      { name: 'model', type: 'string', required: true, description: 'Model ID, e.g. BAAI/bge-large-en-v1.5 or togethercomputer/m2-bert-80M-8k-retrieval.' },
      { name: 'input', type: 'string or array of strings', required: true, description: 'Input text(s) to compute vector embeddings for.' },
      { name: 'encoding_format', type: 'string', required: false, default: 'float', description: 'Format to return embeddings: "float" or "base64".' },
      { name: 'dimensions', type: 'integer', required: false, description: 'The number of dimensions the resulting output embeddings should have.' },
    ],
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.embeddings.create(
    model="BAAI/bge-large-en-v1.5",
    input="New York City",
)
print(response.data[0].embedding)`,
      typescript: `import Together from 'together-ai';
const client = new Together();

const response = await client.embeddings.create({
  model: 'BAAI/bge-large-en-v1.5',
  input: 'New York City',
});
console.log(response.data[0].embedding);`,
      curl: `curl -X POST "https://api.together.ai/v1/embeddings" \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "BAAI/bge-large-en-v1.5",
    "input": "New York City"
  }'`,
    },
  };
}

// ── 3. Parameter Validation ──────────────────────────────────────────────────

export function validateRerankParams(params = {}) {
  const errors = [];
  const warnings = [];

  const {
    model = 'mixedbread-ai/mxbai-rerank-large-v2',
    query,
    documents,
    top_n,
    rank_fields,
    return_documents,
  } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    errors.push('The "query" parameter is required and must be a non-empty string.');
  }

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    errors.push('The "documents" parameter is required and must be a non-empty array of strings or objects.');
  } else {
    const hasObjects = documents.some(d => typeof d === 'object' && d !== null);
    if (hasObjects) {
      if (rank_fields && !Array.isArray(rank_fields)) {
        errors.push('"rank_fields" must be an array of string field names (e.g. ["subject", "text"]).');
      }
      if (!rank_fields) {
        warnings.push('Structured JSON documents detected without explicit "rank_fields". Defaulting to all string values.');
      }
    }
    if (top_n !== undefined && top_n !== null) {
      const topNNum = Number(top_n);
      if (isNaN(topNNum) || topNNum <= 0) {
        errors.push('"top_n" must be a positive integer.');
      } else if (topNNum > documents.length) {
        warnings.push(`"top_n" (${topNNum}) exceeds document count (${documents.length}). Will return all documents.`);
      }
    }
  }

  const knownModel = RERANK_MODELS_CATALOG.find(m => m.id === model);
  if (!knownModel) {
    warnings.push(`Model '${model}' is not in the standard catalog. Verify dedicated endpoint availability.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    model,
    document_count: Array.isArray(documents) ? documents.length : 0,
    top_n: top_n ? Number(top_n) : (Array.isArray(documents) ? documents.length : 0),
    has_structured_documents: Array.isArray(documents) && documents.some(d => typeof d === 'object' && d !== null),
  };
}

export function validateEmbeddingsParams(params = {}) {
  const errors = [];
  const warnings = [];

  const {
    model = 'BAAI/bge-large-en-v1.5',
    input,
    encoding_format = 'float',
    dimensions,
  } = params;

  if (!input) {
    errors.push('The "input" parameter is required.');
  } else if (typeof input !== 'string' && !Array.isArray(input)) {
    errors.push('The "input" parameter must be a string or array of strings.');
  } else if (Array.isArray(input) && input.length === 0) {
    errors.push('The "input" array cannot be empty.');
  }

  if (encoding_format && !['float', 'base64'].includes(encoding_format)) {
    errors.push('"encoding_format" must be either "float" or "base64".');
  }

  if (dimensions !== undefined && dimensions !== null) {
    const dimNum = Number(dimensions);
    if (isNaN(dimNum) || dimNum <= 0) {
      errors.push('"dimensions" must be a positive integer.');
    }
  }

  const knownModel = EMBEDDING_MODELS_CATALOG.find(m => m.id === model);
  if (!knownModel) {
    warnings.push(`Model '${model}' is not in the standard embeddings catalog.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    model,
    encoding_format,
  };
}

// ── 4. Execution Dispatchers (Rerank & Embeddings) ───────────────────────────

export async function executeRerank(params = {}) {
  const {
    model = 'mixedbread-ai/mxbai-rerank-large-v2',
    query = 'What animals can I find near Peru?',
    documents = [
      'The giant panda is a bear species endemic to China.',
      'The llama is a domesticated South American camelid widely used in Andean cultures.',
      'The wild Bactrian camel is endemic to Northwest China and southwestern Mongolia.',
      'The guanaco is a camelid native to South America, closely related to the llama.'
    ],
    top_n,
    return_documents = true,
    rank_fields,
    dry_run = false,
  } = params;

  if (dry_run) {
    const topN = top_n ? Math.min(Number(top_n), documents.length) : documents.length;
    const queryTokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);

    const scored = documents.map((doc, idx) => {
      let docText = '';
      if (typeof doc === 'string') {
        docText = doc;
      } else if (doc && typeof doc === 'object') {
        if (Array.isArray(rank_fields) && rank_fields.length > 0) {
          docText = rank_fields.map(k => doc[k] || '').filter(Boolean).join(' ');
        } else {
          docText = doc.text || doc.title || JSON.stringify(doc);
        }
      }

      let matches = 0;
      queryTokens.forEach(token => {
        if (docText.toLowerCase().includes(token)) matches++;
      });

      const baseScore = queryTokens.length > 0 ? (matches / queryTokens.length) : 0.5;
      // High score for exact match, smooth heuristic for others
      const score = Math.min(0.98, Math.max(0.01, baseScore * 0.85 + 0.15 - (idx * 0.03)));

      const item = {
        index: idx,
        relevance_score: Number(score.toFixed(4)),
      };

      if (return_documents) {
        item.document = typeof doc === 'string' ? { text: doc } : doc;
      }

      return item;
    });

    scored.sort((a, b) => b.relevance_score - a.relevance_score);
    const topResults = scored.slice(0, topN);

    return {
      success: true,
      dry_run: true,
      model,
      query,
      results: topResults,
      usage: {
        total_tokens: Math.max(10, Math.round(query.length + documents.length * 20)),
      },
    };
  }

  // Live upstream call via llmClient
  const res = await llmRerank(query, documents, {
    model,
    top_n,
    return_documents,
    rank_fields,
  });

  return {
    success: true,
    model,
    query,
    ...res,
  };
}

export async function executeEmbeddings(params = {}) {
  const {
    model = 'BAAI/bge-large-en-v1.5',
    input = 'Aphura Sovereign Embeddings',
    encoding_format = 'float',
    dimensions,
    dry_run = false,
  } = params;

  if (dry_run) {
    const inputs = Array.isArray(input) ? input : [input];
    const dim = dimensions || (model.includes('bge-large') ? 1024 : 768);

    const data = inputs.map((text, idx) => {
      const str = String(text);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      const rawVector = new Array(dim).fill(0).map((_, dIdx) => {
        const val = Math.sin(hash + dIdx);
        return Number((val * 0.05).toFixed(6));
      });

      let embeddingValue = rawVector;
      if (encoding_format === 'base64') {
        const floatArray = new Float32Array(rawVector);
        embeddingValue = Buffer.from(floatArray.buffer).toString('base64');
      }

      return {
        object: 'embedding',
        index: idx,
        embedding: embeddingValue,
      };
    });

    return {
      success: true,
      dry_run: true,
      object: 'list',
      model,
      data,
      usage: {
        prompt_tokens: inputs.reduce((acc, str) => acc + Math.round(str.length / 4), 0),
        total_tokens: inputs.reduce((acc, str) => acc + Math.round(str.length / 4), 0),
      },
    };
  }

  const res = await llmCreateEmbeddings(input, {
    model,
    encoding_format,
    dimensions,
  });

  return {
    success: true,
    ...res,
  };
}

/**
 * End-to-End RAG Pipeline: Ingests documents, indexes candidates, and applies cross-encoder rerank
 */
export async function executeRagPipeline(params = {}) {
  const {
    query,
    candidates = [],
    model = 'mixedbread-ai/mxbai-rerank-large-v2',
    top_n = 3,
    dry_run = false,
  } = params;

  const reranked = await executeRerank({
    model,
    query,
    documents: candidates,
    top_n,
    return_documents: true,
    dry_run,
  });

  return {
    success: true,
    stage: 'two_stage_rag_pipeline',
    query,
    candidate_count: candidates.length,
    selected_count: reranked.results?.length || 0,
    top_documents: reranked.results || [],
    usage: reranked.usage,
  };
}

export default {
  RERANK_MODELS_CATALOG,
  EMBEDDING_MODELS_CATALOG,
  getRerankOverview,
  getEmbeddingsOverview,
  validateRerankParams,
  validateEmbeddingsParams,
  executeRerank,
  executeEmbeddings,
  executeRagPipeline,
};
