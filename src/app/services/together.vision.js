/**
 * Aphura Sovereign Together.ai Vision Inference Suite Service
 * Complete Implementation of Together AI Vision Inference across 4 Core Domains:
 * 
 * 1. Overview & Pricing Formula:         https://docs.together.ai/docs/inference/vision/overview
 *    - VLMs, 560px tile grid pricing (1,601 tokens/tile, max 6,404 tokens), supported models
 * 2. Vision Inputs & Formats:             https://docs.together.ai/docs/inference/vision/inputs
 *    - Hosted URLs, Base64 local images, multi-image comparison, dedicated video_url (Qwen3-VL)
 * 3. Structured Extraction with Vision:   https://docs.together.ai/docs/inference/vision/structured-extraction
 *    - Multimodal prompt + response_format json_schema, reasoning=false for Kimi-K3, Pydantic & Zod
 * 4. Vision-Language Function Calling:   https://docs.together.ai/docs/inference/vision/function-calling
 *    - Multimodal message + tools array, tool_choice, visual feature grounding for tool dispatch
 * 
 * License: MIT
 */

import { executeSharedInference } from './together.inference.js';

// ── 1. Vision Models Catalog & Token Math ────────────────────────────────────

export const VISION_MODELS_CATALOG = [
  {
    id: 'moonshotai/Kimi-K3',
    name: 'Kimi-K3 Vision',
    type: 'Reasoning-Default Vision-Language Model',
    context_window: 1048576, // 1M tokens
    input_price_per_m: 0.60,
    output_price_per_m: 2.50,
    capabilities: ['image_url', 'base64', 'multi_image', 'structured_extraction', 'function_calling'],
    recommended_for: 'Document analysis, complex reasoning, structured extraction (with reasoning: { enabled: false }), tool calling.',
  },
  {
    id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    name: 'Llama 3.2 90B Vision Instruct Turbo',
    type: 'Flagship Open Multimodal Model',
    context_window: 131072, // 128k tokens
    input_price_per_m: 1.20,
    output_price_per_m: 1.20,
    capabilities: ['image_url', 'base64', 'multi_image', 'structured_extraction', 'function_calling'],
    recommended_for: 'High-fidelity visual understanding, chart/graph interpretation, side-by-side image comparison.',
  },
  {
    id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
    name: 'Llama 3.2 11B Vision Instruct Turbo',
    type: 'High-Speed Multimodal Model',
    context_window: 131072, // 128k tokens
    input_price_per_m: 0.18,
    output_price_per_m: 0.18,
    capabilities: ['image_url', 'base64', 'multi_image', 'structured_extraction', 'function_calling'],
    recommended_for: 'Ultra-low latency visual classification, thumbnail scanning, real-time visual OCR.',
  },
  {
    id: 'Qwen/Qwen3-VL-8B-Instruct',
    name: 'Qwen3-VL 8B Instruct',
    type: 'Multimodal Image & Dedicated Video Model',
    context_window: 131072,
    input_price_per_m: 0.20,
    output_price_per_m: 0.20,
    capabilities: ['image_url', 'base64', 'multi_image', 'video_url', 'structured_extraction', 'function_calling'],
    recommended_for: 'Native video_url understanding, multi-frame video scene analysis, and rapid visual Q&A.',
  },
];

/**
 * Calculates image token consumption according to Together AI Vision token formula:
 * Images are partitioned into 560px square tiles, capped at a 2x2 grid.
 * Each tile consumes exactly 1,601 tokens.
 * 
 *   tile_x = min(2, max(1, floor(width / 560)))
 *   tile_y = min(2, max(1, floor(height / 560)))
 *   total_tokens = tile_x * tile_y * 1601
 * 
 * Maximum token consumption is 6,404 tokens (4 tiles).
 */
export function calculateVisionTokens(width, height) {
  const w = Math.max(1, parseInt(width, 10) || 560);
  const h = Math.max(1, parseInt(height, 10) || 560);

  const tilesX = Math.min(2, Math.max(1, Math.floor(w / 560)));
  const tilesY = Math.min(2, Math.max(1, Math.floor(h / 560)));
  const totalTiles = tilesX * tilesY;
  const tokensPerTile = 1601;
  const totalTokens = totalTiles * tokensPerTile;

  return {
    width: w,
    height: h,
    tile_size_px: 560,
    tiles_x: tilesX,
    tiles_y: tilesY,
    total_tiles: totalTiles,
    tokens_per_tile: tokensPerTile,
    total_tokens: totalTokens,
    max_tokens: 6404,
    pricing_note: 'Images break into tiles of 560px, capped at 2x2. Each tile costs 1,601 tokens.',
  };
}

// ── 2. Vision Overview Docs ──────────────────────────────────────────────────

export function getVisionOverview() {
  return {
    success: true,
    title: 'Together AI Vision-Language Models Overview & Token Pricing',
    docs_url: 'https://docs.together.ai/docs/inference/vision/overview',
    recommended_model: 'moonshotai/Kimi-K3',
    fallback_model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    models: VISION_MODELS_CATALOG,
    pricing_formula: {
      tile_size_px: 560,
      max_grid: '2x2',
      tokens_per_tile: 1601,
      min_tokens: 1601,
      max_tokens: 6404,
      possible_token_costs: [
        { grid: '1x1', tiles: 1, tokens: 1601 },
        { grid: '1x2', tiles: 2, tokens: 3202 },
        { grid: '2x1', tiles: 2, tokens: 3202 },
        { grid: '2x2', tiles: 4, tokens: 6404 },
      ],
      description: 'Images break into tiles of 560px, capped at 2x2. Each tile costs 1,601 tokens.',
    },
    multimodal_structure: {
      description: 'Vision models take both image and text inputs in the messages array using content blocks.',
      block_types: ['text', 'image_url', 'video_url'],
    },
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.chat.completions.create(
    model="moonshotai/Kimi-K3",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What is in this image?"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-cross-roads.jpg/2560px-Gfp-wisconsin-madison-the-cross-roads.jpg"
                    }
                }
            ]
        }
    ]
)
print(response.choices[0].message.content)`,
      typescript: `import Together from "together-ai";
const client = new Together();

const response = await client.chat.completions.create({
  model: "moonshotai/Kimi-K3",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What is in this image?" },
        {
          type: "image_url",
          image_url: {
            url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-cross-roads.jpg/2560px-Gfp-wisconsin-madison-the-cross-roads.jpg"
          }
        }
      ]
    }
  ]
});
console.log(response.choices[0].message.content);`,
      curl: `curl https://api.together.ai/v1/chat/completions \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "moonshotai/Kimi-K3",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {
          "type": "image_url",
          "image_url": {
            "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-cross-roads.jpg/2560px-Gfp-wisconsin-madison-the-cross-roads.jpg"
          }
        }
      ]
    }
  ]
}'`,
    },
  };
}

// ── 3. Vision Inputs Docs ────────────────────────────────────────────────────

export function getVisionInputsDocs() {
  return {
    success: true,
    title: 'Together AI Vision Inputs: URLs, Base64, Multi-Image & Video',
    docs_url: 'https://docs.together.ai/docs/inference/vision/inputs',
    input_types: [
      {
        type: 'hosted_url',
        key: 'image_url.url',
        example: 'https://example.com/photo.jpg',
        description: 'Publicly accessible HTTP/HTTPS URL pointing directly to an image (JPEG, PNG, WebP, GIF).',
      },
      {
        type: 'base64_data_url',
        key: 'image_url.url',
        example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        description: 'Local image encoded directly as a data URL with base64 payload. Best for private/local files.',
      },
      {
        type: 'multi_image',
        key: 'content array',
        description: 'Multiple image_url blocks in a single user message for comparisons, diffing, or multi-view reasoning.',
      },
      {
        type: 'video_url',
        key: 'video_url.url',
        supported_model: 'Qwen/Qwen3-VL-8B-Instruct',
        example: 'https://example.com/sample_video.mp4',
        description: 'Dedicated video understanding endpoint passing video URLs to Qwen3-VL.',
      },
    ],
    code_snippets: {
      base64_python: `import base64
from together import Together

client = Together()

with open("local_image.jpg", "rb") as image_file:
    base64_image = base64.b64encode(image_file.read()).decode("utf-8")

response = client.chat.completions.create(
    model="meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this local photo in detail."},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                }
            ]
        }
    ]
)
print(response.choices[0].message.content)`,
      multi_image_python: `response = client.chat.completions.create(
    model="meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Compare these two images and point out the key differences."},
                {"type": "image_url", "image_url": {"url": "https://example.com/before.jpg"}},
                {"type": "image_url", "image_url": {"url": "https://example.com/after.jpg"}}
            ]
        }
    ]
)`,
      video_url_python: `response = client.chat.completions.create(
    model="Qwen/Qwen3-VL-8B-Instruct",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Summarize what happens in this video."},
                {"type": "video_url", "video_url": {"url": "https://example.com/video.mp4"}}
            ]
        }
    ]
)`,
    },
  };
}

// ── 4. Structured Extraction with Vision Docs ────────────────────────────────

export function getStructuredExtractionDocs() {
  return {
    success: true,
    title: 'Structured Extraction with Vision on Together AI',
    docs_url: 'https://docs.together.ai/docs/inference/vision/structured-extraction',
    recommended_model: 'moonshotai/Kimi-K3',
    critical_configuration: {
      reasoning: { enabled: false },
      note: 'When using reasoning-default models like moonshotai/Kimi-K3 with structured outputs, you must disable reasoning via reasoning={"enabled": false}.',
    },
    use_cases: [
      'Receipt and invoice information parsing into typed schema',
      'UI mockups and wireframes to component tree structure',
      'Chart and graph data extraction to CSV / JSON tabular tables',
      'Handwritten document transcription to structured fields',
      'Product packaging inspection and ingredient extraction',
    ],
    code_snippets: {
      python: `import json
from pydantic import BaseModel, Field
from together import Together

client = Together()

class ReceiptItem(BaseModel):
    item: str = Field(description="Name or description of the line item")
    price: float = Field(description="Price of the item in USD")
    quantity: int = Field(default=1, description="Quantity purchased")

class ReceiptSchema(BaseModel):
    merchant_name: str
    date: str
    items: list[ReceiptItem]
    subtotal: float
    tax: float
    total: float

response = client.chat.completions.create(
    model="moonshotai/Kimi-K3",
    reasoning={"enabled": False},
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Extract all line items and totals from this receipt."},
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/receipt.jpg"}
                }
            ]
        }
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "receipt_extraction",
            "schema": ReceiptSchema.model_json_schema()
        }
    }
)
extracted_data = json.loads(response.choices[0].message.content)
print(json.dumps(extracted_data, indent=2))`,
      typescript: `import Together from "together-ai";
const client = new Together();

const ReceiptJsonSchema = {
  name: "receipt_extraction",
  schema: {
    type: "object",
    properties: {
      merchant_name: { type: "string" },
      date: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            price: { type: "number" },
            quantity: { type: "integer" }
          },
          required: ["item", "price"]
        }
      },
      total: { type: "number" }
    },
    required: ["merchant_name", "items", "total"]
  }
};

const response = await client.chat.completions.create({
  model: "moonshotai/Kimi-K3",
  reasoning: { enabled: false },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Extract receipt details from image" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/receipt.jpg" }
        }
      ]
    }
  ],
  response_format: {
    type: "json_schema",
    json_schema: ReceiptJsonSchema
  }
});

console.log(JSON.parse(response.choices[0].message.content));`,
    },
  };
}

// ── 5. Vision-Language Function Calling Docs ─────────────────────────────────

export function getVisionFunctionCallingDocs() {
  return {
    success: true,
    title: 'Vision-Language Function Calling on Together AI',
    docs_url: 'https://docs.together.ai/docs/inference/vision/function-calling',
    supported_models: ['moonshotai/Kimi-K3', 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'],
    workflow: [
      { step: 1, action: 'Define tools array with standard JSON schema parameters.' },
      { step: 2, action: 'Formulate user message with multimodal content (text prompt + image_url blocks).' },
      { step: 3, action: 'Pass tools alongside multimodal messages to client.chat.completions.create.' },
      { step: 4, action: 'VLM inspects visual scene, grounds visual objects, and emits tool_calls array.' },
      { step: 5, action: 'Aphura Sovereign Gateway executes tool and returns result to model.' },
    ],
    code_snippets: {
      python: `import json
from together import Together

client = Together()

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_stock_price",
            "description": "Get current stock price for symbol extracted from image",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Stock ticker symbol (e.g. AAPL, GOOGL, TSLA)"},
                    "exchange": {"type": "string", "enum": ["NYSE", "NASDAQ", "LSE"]}
                },
                "required": ["symbol"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="moonshotai/Kimi-K3",
    reasoning={"enabled": False},
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What is the stock price of the company from the image?"},
                {
                    "type": "image_url",
                    "image_url": {"url": "https://53.fs1.hubspotusercontent-na1.net/hubfs/53/image8-2.jpg"}
                }
            ]
        }
    ],
    tools=tools
)

tool_calls = response.choices[0].message.model_dump().get("tool_calls", [])
print(json.dumps(tool_calls, indent=2))`,
      typescript: `import Together from "together-ai";
const client = new Together();

const tools = [
  {
    type: "function",
    function: {
      name: "get_current_stock_price",
      description: "Get the current stock price for the given stock symbol",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "The stock symbol, e.g. AAPL, GOOGL" },
          exchange: { type: "string", enum: ["NYSE", "NASDAQ"] }
        },
        required: ["symbol"]
      }
    }
  }
];

const response = await client.chat.completions.create({
  model: "moonshotai/Kimi-K3",
  reasoning: { enabled: false },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What is the stock price of the company from the image?" },
        {
          type: "image_url",
          image_url: { url: "https://53.fs1.hubspotusercontent-na1.net/hubfs/53/image8-2.jpg" }
        }
      ]
    }
  ],
  tools
});

console.log(response.choices[0].message.tool_calls);`,
    },
  };
}

// ── 6. Multimodal Message Formatter Helper ───────────────────────────────────

export function formatMultimodalMessage({
  text = '',
  imageUrls = [],
  base64Images = [],
  videoUrls = [],
  role = 'user',
} = {}) {
  const content = [];

  if (text && typeof text === 'string' && text.trim().length > 0) {
    content.push({ type: 'text', text: text.trim() });
  }

  // Format hosted image URLs
  const cleanImageUrls = Array.isArray(imageUrls) ? imageUrls : [imageUrls].filter(Boolean);
  cleanImageUrls.forEach((url) => {
    if (typeof url === 'string' && url.length > 0) {
      content.push({
        type: 'image_url',
        image_url: { url },
      });
    }
  });

  // Format Base64 images
  const cleanBase64 = Array.isArray(base64Images) ? base64Images : [base64Images].filter(Boolean);
  cleanBase64.forEach((b64) => {
    if (typeof b64 === 'string' && b64.length > 0) {
      const dataUrl = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
  });

  // Format dedicated video URLs
  const cleanVideoUrls = Array.isArray(videoUrls) ? videoUrls : [videoUrls].filter(Boolean);
  cleanVideoUrls.forEach((url) => {
    if (typeof url === 'string' && url.length > 0) {
      content.push({
        type: 'video_url',
        video_url: { url },
      });
    }
  });

  return {
    role,
    content,
  };
}

// ── 7. Vision Completion Dispatcher & Execution ──────────────────────────────

export async function executeVisionCompletion(params = {}) {
  const {
    model = 'moonshotai/Kimi-K3',
    prompt = 'Describe this image in detail',
    image_url,
    image_urls = [],
    base64_image,
    base64_images = [],
    video_url,
    video_urls = [],
    messages = null,
    response_format = null,
    tools = null,
    tool_choice = null,
    reasoning = null,
    temperature = 0.7,
    max_tokens = 1024,
    dry_run = false,
  } = params;

  // Build messages array if not supplied directly
  let resolvedMessages = messages;
  if (!resolvedMessages || !Array.isArray(resolvedMessages) || resolvedMessages.length === 0) {
    const allImageUrls = [...(image_url ? [image_url] : []), ...(Array.isArray(image_urls) ? image_urls : [])];
    const allBase64 = [...(base64_image ? [base64_image] : []), ...(Array.isArray(base64_images) ? base64_images : [])];
    const allVideos = [...(video_url ? [video_url] : []), ...(Array.isArray(video_urls) ? video_urls : [])];

    const formattedMessage = formatMultimodalMessage({
      text: prompt,
      imageUrls: allImageUrls,
      base64Images: allBase64,
      videoUrls: allVideos,
      role: 'user',
    });

    resolvedMessages = [formattedMessage];
  }

  // Configure reasoning parameter: if structured outputs or function calling are requested with Kimi-K3, disable reasoning by default if not set
  let resolvedReasoning = reasoning;
  if (model.includes('Kimi-K3') && (response_format || tools) && resolvedReasoning === null) {
    resolvedReasoning = { enabled: false };
  }

  const payload = {
    model,
    messages: resolvedMessages,
    temperature,
    max_tokens,
  };

  if (resolvedReasoning !== null) {
    payload.reasoning = resolvedReasoning;
  }
  if (response_format) {
    payload.response_format = response_format;
  }
  if (tools && Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    if (tool_choice) {
      payload.tool_choice = tool_choice;
    }
  }

  // Handle dry-run or mock execution for test suites & validation
  if (dry_run) {
    const isStructured = Boolean(response_format);
    const isToolCall = Boolean(tools && tools.length > 0);

    let mockContent = `[Vision Analysis simulated dry-run for ${model}]: High-confidence scene understanding complete. Detected visual features successfully grounded.`;
    let mockToolCalls = null;

    if (isStructured) {
      mockContent = JSON.stringify({
        status: 'extracted',
        model_used: model,
        summary: 'Structured JSON parsed successfully from image schema.',
      });
    } else if (isToolCall) {
      const toolName = tools[0]?.function?.name || 'analyze_visual_data';
      mockToolCalls = [
        {
          id: `call_vision_${Date.now()}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: JSON.stringify({ symbol: 'GOOGL', confidence: 0.98 }),
          },
        },
      ];
      mockContent = null;
    }

    return {
      success: true,
      dry_run: true,
      model,
      id: `vis_dry_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: mockContent,
            ...(mockToolCalls ? { tool_calls: mockToolCalls } : {}),
          },
          finish_reason: isToolCall ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1601 + 24, // 1 tile + text
        completion_tokens: 65,
        total_tokens: 1690,
      },
      payload_preview: payload,
    };
  }

  // Live dispatch via executeSharedInference
  return executeSharedInference({
    endpoint: 'chat/completions',
    body: payload,
  });
}
