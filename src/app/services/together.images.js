/**
 * Aphura Sovereign Together.ai Images Inference Suite Service
 * Complete Implementation of Together AI Image Generation across 3 Core Domains:
 * 
 * 1. Text-to-Image Overview:     https://docs.together.ai/docs/inference/images/overview
 *    - Model querying via .images.generate, base64 vs URL response formats, disk saving, serverless models catalog
 * 2. Reference Images & Img2Img: https://docs.together.ai/docs/inference/images/reference-images
 *    - Image-to-image editing via image_url (Kontext models) and reference_images array (FLUX.2 & Google models)
 * 3. Parameters & Troubleshooting: https://docs.together.ai/docs/inference/images/parameters
 *    - Dimensions (multiples of 8), steps (quality/latency trade-off), guidance_scale, seed, n, negative_prompt
 *    - Output format (jpeg/png), safety checker, capability-specific params (LoRAs, frame_images)
 * 
 * License: MIT
 */

import { executeSharedInference } from './together.inference.js';

// ── 1. Image Models Catalog ──────────────────────────────────────────────────

export const IMAGE_MODELS_CATALOG = [
  {
    id: 'black-forest-labs/FLUX.1.1-pro',
    name: 'FLUX.1.1 Pro',
    type: 'Text-to-Image',
    serverless: true,
    notes: 'High quality; recommended production starting point.',
  },
  {
    id: 'black-forest-labs/FLUX.2-pro',
    name: 'FLUX.2 Pro',
    type: 'Text-to-Image & Img2Img',
    serverless: true,
    notes: 'High fidelity; supports reference_images array for multi-image editing.',
  },
  {
    id: 'black-forest-labs/FLUX.2-dev',
    name: 'FLUX.2 Dev',
    type: 'Text-to-Image & Img2Img',
    serverless: true,
    notes: 'Open-weight tuning; supports guidance_scale, steps, and LoRAs.',
  },
  {
    id: 'black-forest-labs/FLUX.2-flex',
    name: 'FLUX.2 Flex',
    type: 'Text-to-Image & Img2Img',
    serverless: true,
    notes: 'Adjustable steps/guidance; industry-leading typography and text rendering.',
  },
  {
    id: 'black-forest-labs/FLUX.1-kontext-pro',
    name: 'FLUX.1 Kontext Pro',
    type: 'Image Editing',
    serverless: true,
    notes: 'Direct image-to-image transformation via image_url parameter.',
  },
  {
    id: 'black-forest-labs/FLUX.2-max',
    name: 'FLUX.2 Max',
    type: 'Text-to-Image',
    serverless: true,
    notes: 'Highest fidelity flagship FLUX.2 variant.',
  },
  {
    id: 'black-forest-labs/FLUX.1-kontext-max',
    name: 'FLUX.1 Kontext Max',
    type: 'Image Editing',
    serverless: true,
    notes: 'Highest-quality image editing and fine-grained style transfer.',
  },
];

export const COMMON_RESOLUTIONS = [
  { name: 'Square', width: 1024, height: 1024, aspect_ratio: '1:1', use_case: 'Social media posts, profile pictures, avatars' },
  { name: 'Landscape', width: 1344, height: 768, aspect_ratio: '16:9', use_case: 'Banners, desktop wallpapers, hero sections' },
  { name: 'Portrait', width: 768, height: 1344, aspect_ratio: '9:16', use_case: 'Mobile wallpapers, stories, vertical posters' },
];

export const MODEL_COMPATIBILITY_MATRIX = {
  'FLUX.1 Schnell': { prompt: 'Required', width_height: true, aspect_ratio: false, steps: '✓ (default 4)', guidance_scale: false, n: true, seed: true, negative_prompt: true, prompt_upsampling: false, response_format: true, output_format: true, disable_safety_checker: true },
  'FLUX.1.1 Pro': { prompt: 'Required', width_height: true, aspect_ratio: false, steps: false, guidance_scale: false, n: true, seed: true, negative_prompt: true, prompt_upsampling: false, response_format: true, output_format: true, disable_safety_checker: true },
  'FLUX.2 Pro': { prompt: 'Required', width_height: true, aspect_ratio: false, steps: false, guidance_scale: false, n: true, seed: true, negative_prompt: false, prompt_upsampling: true, response_format: true, output_format: true, disable_safety_checker: true },
  'FLUX.2 Dev': { prompt: 'Required', width_height: true, aspect_ratio: false, steps: '✓ (default 20)', guidance_scale: '✓ (default 3.5)', n: true, seed: true, negative_prompt: false, prompt_upsampling: false, response_format: true, output_format: true, disable_safety_checker: true },
  'FLUX.2 Flex': { prompt: 'Required', width_height: true, aspect_ratio: false, steps: '✓', guidance_scale: '✓', n: true, seed: true, negative_prompt: false, prompt_upsampling: false, response_format: true, output_format: true, disable_safety_checker: true },
  'Kontext Pro/Max': { prompt: 'Required', width_height: false, aspect_ratio: true, steps: '✓ (default 28)', guidance_scale: false, n: true, seed: true, negative_prompt: false, prompt_upsampling: false, response_format: true, output_format: true, disable_safety_checker: true },
};

// ── 2. Images Overview ───────────────────────────────────────────────────────

export function getImagesOverview() {
  return {
    success: true,
    title: 'Together AI Text-to-Image Generation Overview',
    docs_url: 'https://docs.together.ai/docs/inference/images/overview',
    recommended_model: 'black-forest-labs/FLUX.1.1-pro',
    models: IMAGE_MODELS_CATALOG,
    common_resolutions: COMMON_RESOLUTIONS,
    save_to_disk_pattern: {
      recommendation: 'Use response_format: "base64" to embed bytes in b64_json, avoiding extra network downloads and CDN header restrictions.',
      cdn_warning: 'If using the URL format, ensure HTTP requests include a non-empty User-Agent header (CDN returns 403 on blank User-Agent).',
    },
    code_snippets: {
      python: `from together import Together
client = Together()

response = client.images.generate(
    prompt="A serene mountain landscape at sunset with a lake reflection",
    model="black-forest-labs/FLUX.2-dev",
    steps=20,
    response_format="base64"
)`,
      typescript: `import Together from "together-ai";
const together = new Together();

const response = await together.images.generate({
  prompt: "A serene mountain landscape at sunset with a lake reflection",
  model: "black-forest-labs/FLUX.2-dev",
  steps: 20,
  response_format: "base64"
});`,
    },
    infrastructure: 'Liberty Center One & Together.ai Sovereign Fleet',
  };
}

// ── 3. Reference Images & Image-to-Image ─────────────────────────────────────

export function getReferenceImagesDocs() {
  return {
    success: true,
    title: 'Image-to-Image Generation with Reference Images Reference',
    docs_url: 'https://docs.together.ai/docs/inference/images/reference-images',
    parameters: [
      {
        name: 'image_url',
        type: 'string',
        models: ['FLUX.1 Kontext Pro', 'FLUX.1 Kontext Max', 'FLUX.2 Pro', 'FLUX.2 Flex'],
        description: 'A single image URL to edit or transform (e.g. style transfer, watercolor conversion).',
      },
      {
        name: 'reference_images',
        type: 'string[]',
        models: ['FLUX.2 Pro', 'FLUX.2 Dev', 'FLUX.2 Flex', 'SDXL', 'Flash Image 2.5'],
        description: 'An array of image URLs to guide multi-image generation, subject replacement, or composite editing.',
      },
    ],
    rules: [
      'reference_images is recommended for FLUX.2 and Google models because it supports multi-image inputs.',
      'FLUX.2 [dev], SDXL, and Flash Image 2.5 strictly require reference_images array.',
      'Kontext models strictly require image_url and use aspect_ratio for output sizing.',
    ],
    code_snippets: {
      kontext_python: `response = client.images.generate(
    model="black-forest-labs/FLUX.1-kontext-pro",
    prompt="Transform this into a watercolor painting",
    image_url="https://example.com/cat.jpg",
    aspect_ratio="4:3"
)`,
      flux2_python: `response = client.images.generate(
    model="black-forest-labs/FLUX.2-pro",
    prompt="Replace the color of the car to blue",
    reference_images=["https://example.com/car.jpg"],
    width=1024,
    height=768
)`,
    },
  };
}

// ── 4. Image Generation Parameters & Troubleshooting ─────────────────────────

export const IMAGE_PARAMETERS_SCHEMA = {
  prompt: {
    type: 'string',
    required: true,
    description: 'Description of the image to generate. Be specific about subject, setting, lighting, and style.',
  },
  model: {
    type: 'string',
    required: true,
    default: 'black-forest-labs/FLUX.1.1-pro',
    description: 'Image model identifier string from the serverless or dedicated catalog.',
  },
  negative_prompt: {
    type: 'string',
    required: false,
    description: 'Elements to avoid in the output (e.g. "blurry, low quality, distorted, oversaturated").',
  },
  width: {
    type: 'integer',
    required: false,
    default: 1024,
    rule: 'Must be a multiple of 8.',
    description: 'Width of generated image in pixels.',
  },
  height: {
    type: 'integer',
    required: false,
    default: 1024,
    rule: 'Must be a multiple of 8.',
    description: 'Height of generated image in pixels.',
  },
  aspect_ratio: {
    type: 'string',
    required: false,
    enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
    description: 'Output aspect ratio for FLUX Schnell and Kontext family models.',
  },
  steps: {
    type: 'integer',
    required: false,
    default: 20,
    range: [1, 50],
    description: 'Diffusion steps. More steps improve quality at near-linear latency cost. Schnell defaults to 4, Kontext to 28.',
  },
  guidance_scale: {
    type: 'number',
    required: false,
    default: 3.5,
    range: [1.0, 20.0],
    description: 'Controls prompt fidelity. 8-10 for strict prompt following; 1-5 for creative variance.',
  },
  seed: {
    type: 'integer',
    required: false,
    description: 'Deterministic integer seed for reproducible evals and regression testing.',
  },
  n: {
    type: 'integer',
    required: false,
    default: 1,
    range: [1, 4],
    description: 'Number of image variations to generate per request.',
  },
  response_format: {
    type: 'string',
    enum: ['url', 'base64'],
    default: 'url',
    description: 'Format of returned images. "base64" embeds raw bytes under b64_json for immediate local disk saving.',
  },
  output_format: {
    type: 'string',
    enum: ['jpeg', 'png'],
    default: 'jpeg',
    description: 'Encoding format. PNG preserves transparency; JPEG provides smaller file size.',
  },
  disable_safety_checker: {
    type: 'boolean',
    default: false,
    description: 'Disables the built-in NSFW safety filter (which returns HTTP 422 if triggered).',
  },
  image_url: {
    type: 'string',
    description: 'Single reference image URL for Kontext or FLUX.2 single-image transformations.',
  },
  reference_images: {
    type: 'array',
    items: { type: 'string' },
    description: 'Array of reference image URLs for multi-image composition and editing.',
  },
};

export function getImageParametersDocs() {
  return {
    success: true,
    title: 'Image Generation Parameters & Troubleshooting Reference',
    docs_url: 'https://docs.together.ai/docs/inference/images/parameters',
    schema: IMAGE_PARAMETERS_SCHEMA,
    compatibility_matrix: MODEL_COMPATIBILITY_MATRIX,
    quick_troubleshooting: [
      { problem: 'Image does not match the prompt', solution: 'Make prompt more specific, add negative_prompt, or raise guidance_scale to 8-10.' },
      { problem: 'Poor image quality or blurriness', solution: 'Raise steps to 30-40, add "highly detailed, 8k" to prompt, or set negative_prompt="blurry, distorted".' },
      { problem: 'Generation latency is too slow', solution: 'Lower steps (e.g. 15-20) or generate fewer images per call (lower n to 1).' },
      { problem: 'Need identical output across regression runs', solution: 'Set fixed seed integer (e.g. 42) and identical parameters.' },
      { problem: 'Dimensions rejected or distorted', solution: 'Ensure width and height are multiples of 8 (e.g. 1024x1024, 1344x768).' },
      { problem: 'Image URL returns 403 on download', solution: 'Pass non-empty User-Agent header, or set response_format="base64".' },
    ],
  };
}

// ── 5. Image Parameter Validator ────────────────────────────────────────────

export function validateImageParameters(params = {}) {
  const errors = [];
  const warnings = [];

  if (!params.prompt || typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
    errors.push('prompt is required and must be a non-empty string.');
  }

  if (params.width !== undefined) {
    if (typeof params.width !== 'number' || params.width % 8 !== 0) {
      errors.push(`width (${params.width}) must be a multiple of 8.`);
    }
  }

  if (params.height !== undefined) {
    if (typeof params.height !== 'number' || params.height % 8 !== 0) {
      errors.push(`height (${params.height}) must be a multiple of 8.`);
    }
  }

  if (params.n !== undefined) {
    if (typeof params.n !== 'number' || params.n < 1 || params.n > 4) {
      errors.push(`n (${params.n}) must be an integer between 1 and 4.`);
    }
  }

  if (params.steps !== undefined) {
    if (typeof params.steps !== 'number' || params.steps < 1 || params.steps > 100) {
      errors.push(`steps (${params.steps}) must be an integer between 1 and 100.`);
    }
  }

  if (params.response_format && !['url', 'base64'].includes(params.response_format)) {
    errors.push(`response_format "${params.response_format}" is invalid. Allowed: "url" or "base64".`);
  }

  if (params.output_format && !['jpeg', 'png'].includes(params.output_format)) {
    errors.push(`output_format "${params.output_format}" is invalid. Allowed: "jpeg" or "png".`);
  }

  if (params.guidance_scale !== undefined) {
    if (typeof params.guidance_scale !== 'number' || params.guidance_scale < 1.0 || params.guidance_scale > 20.0) {
      warnings.push(`guidance_scale (${params.guidance_scale}) is outside typical range [1.0, 20.0].`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── 6. Universal Image Generation Dispatcher ────────────────────────────────

export async function executeImageGeneration(params = {}) {
  const startTime = Date.now();
  const model = params.model || 'black-forest-labs/FLUX.1.1-pro';
  const prompt = params.prompt || 'A serene mountain landscape at sunset with a lake reflection';
  const n = params.n || 1;
  const isBase64 = params.response_format === 'base64';

  if (params.dry_run) {
    const mockImages = Array.from({ length: n }, (_, i) => ({
      index: i,
      ...(isBase64 ? {
        b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      } : {
        url: `https://api.together.ai/v1/images/generations/${Math.random().toString(36).slice(2, 10)}.png`,
      }),
      timings: {
        inference: 0.824,
      },
    }));

    return {
      success: true,
      dry_run: true,
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      model,
      prompt,
      duration_ms: 1,
      data: mockImages,
    };
  }

  const payload = {
    model,
    prompt,
    width: params.width || 1024,
    height: params.height || 1024,
    steps: params.steps || 20,
    n,
    response_format: params.response_format || 'url',
    output_format: params.output_format || 'jpeg',
    seed: params.seed,
    negative_prompt: params.negative_prompt,
    disable_safety_checker: params.disable_safety_checker ?? false,
    image_url: params.image_url,
    reference_images: params.reference_images,
  };

  const rawRes = await executeSharedInference(payload, { endpoint: '/v1/images/generations' });

  return {
    success: true,
    model,
    duration_ms: Date.now() - startTime,
    data: rawRes.data || rawRes,
  };
}

export default {
  IMAGE_MODELS_CATALOG,
  COMMON_RESOLUTIONS,
  MODEL_COMPATIBILITY_MATRIX,
  IMAGE_PARAMETERS_SCHEMA,
  getImagesOverview,
  getReferenceImagesDocs,
  getImageParametersDocs,
  validateImageParameters,
  executeImageGeneration,
};
