/**
 * Aphura Sovereign Together.ai Videos Inference Suite Service
 * Complete Implementation of Together AI Video Generation across 4 Core Domains:
 * 
 * 1. Overview & Asynchronous Jobs: https://docs.together.ai/docs/inference/videos/overview
 *    - Asynchronous job lifecycle (queued, in_progress, completed, failed, cancelled), polling, supported models
 * 2. Reference Images & Keyframes: https://docs.together.ai/docs/inference/videos/reference-and-keyframes
 *    - Visual style steering, keyframe control (first/last frames), formula: frame = seconds * fps
 * 3. Audio-Driven Video Generation: https://docs.together.ai/docs/inference/videos/audio-input
 *    - media.audio_inputs, lip-sync, beat matching, constraints (WAV/MP3, 3-30s, <=15MB), auto background music
 * 4. Video Parameters Reference:   https://docs.together.ai/docs/inference/videos/parameters
 *    - Dimensions (width/height vs resolution/ratio for Wan 2.7), steps (10-50), guidance_scale (6-10), unified media schema
 * 
 * License: MIT
 */

import { executeSharedInference } from './together.inference.js';

// ── 1. Video Models & Statuses Catalog ──────────────────────────────────────

export const VIDEO_MODELS_CATALOG = [
  {
    id: 'minimax/video-01-director',
    name: 'MiniMax Video-01 Director',
    type: 'Text-to-Video & Camera Motion',
    resolution_support: 'Up to 1366x768',
    notes: 'Cinematic camera control and photorealistic motion synthesis.',
  },
  {
    id: 'minimax/hailuo-02',
    name: 'MiniMax Hailuo-02',
    type: 'Text-to-Video & Image-to-Video',
    resolution_support: 'Up to 1366x768',
    notes: 'High-speed character animation; supports frame_images keyframes and reference_images.',
  },
  {
    id: 'Wan-AI/wan2.7-t2v',
    name: 'Wan 2.7 Text-to-Video',
    type: 'Text-to-Video with Audio Sync',
    resolution_support: '720P / 1080P (16:9, 9:16, 1:1, 4:3, 3:4)',
    notes: 'Native audio inputs support (media.audio_inputs) for lip sync and beat matching.',
  },
  {
    id: 'Wan-AI/wan2.7-i2v',
    name: 'Wan 2.7 Image-to-Video',
    type: 'Image-to-Video & Extension',
    resolution_support: '720P / 1080P',
    notes: 'Keyframe and video continuation via media.frame_images and media.frame_videos.',
  },
  {
    id: 'kling-ai/kling-video',
    name: 'Kling Video',
    type: 'Keyframe-Driven Video',
    resolution_support: '720P / 1080P',
    notes: 'Requires frame_images keyframes instead of text prompt.',
  },
];

export const JOB_STATUSES = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// ── 2. Videos Overview & Async Job Lifecycle ────────────────────────────────

export function getVideosOverview() {
  return {
    success: true,
    title: 'Together AI Video Generation Overview & Async Job Lifecycle',
    docs_url: 'https://docs.together.ai/docs/inference/videos/overview',
    recommended_model: 'minimax/video-01-director',
    models: VIDEO_MODELS_CATALOG,
    job_lifecycle: [
      { status: 'queued', description: 'Job is queued in the scheduler waiting for GPU allocation.' },
      { status: 'in_progress', description: 'Video diffusion frames are actively rendering.' },
      { status: 'completed', description: 'Generation successful. outputs.video_url is available for download.' },
      { status: 'failed', description: 'Generation failed. Inspect error.message and error.code.' },
      { status: 'cancelled', description: 'Job was cancelled before execution completed.' },
    ],
    polling_rule: 'Video generation is asynchronous. Poll status every 30-60 seconds until completed or failed.',
    download_rule: 'Download generated videos immediately. URLs are short-lived CDN links and should not be used as persistent storage.',
    code_snippets: {
      python: `import time
from together import Together
client = Together()

job = client.videos.create(
    prompt="A serene sunset over the ocean with gentle waves",
    model="minimax/video-01-director",
    width=1366,
    height=768
)
print(f"Job ID: {job.id}")

while True:
    status = client.videos.retrieve(job.id)
    if status.status == "completed":
        print(f"Video URL: {status.outputs.video_url}")
        break
    elif status.status == "failed":
        print(f"Failed: {status.error.message}")
        break
    time.sleep(30)`,
      typescript: `import Together from "together-ai";
const together = new Together();

const job = await together.videos.create({
  prompt: "A serene sunset over the ocean with gentle waves",
  model: "minimax/video-01-director",
  width: 1366,
  height: 768,
});

while (true) {
  const status = await together.videos.retrieve(job.id);
  if (status.status === "completed") {
    console.log("Video URL:", status.outputs.video_url);
    break;
  }
  await new Promise(r => setTimeout(r, 30000));
}`,
    },
    infrastructure: 'Liberty Center One & Together.ai Sovereign Fleet',
  };
}

// ── 3. Reference Images & Keyframes ─────────────────────────────────────────

export function calculateKeyframeNumber(seconds, fps) {
  const s = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  const f = typeof fps === 'string' ? parseInt(fps, 10) : fps;
  if (isNaN(s) || isNaN(f)) return null;
  return Math.round(s * f);
}

export function getReferenceAndKeyframesDocs() {
  return {
    success: true,
    title: 'Video Reference Images and Keyframe Control Reference',
    docs_url: 'https://docs.together.ai/docs/inference/videos/reference-and-keyframes',
    formula: 'Frame number = seconds * fps',
    capabilities: {
      reference_images: {
        description: 'Pass media.reference_images to steer visual style and character consistency across all frames.',
        usage: 'media: { reference_images: ["https://example.com/character.jpg"] }',
      },
      keyframe_control: {
        description: 'Pin specific frames (first, last, or exact frame index) using media.frame_images.',
        usage: 'media: { frame_images: [{ input_image: "<url_or_b64>", frame: "first" }] }',
        types: [
          { type: 'Single Keyframe at Start', rule: 'frame: 0 or "first". Model animates forward from the image.' },
          { type: 'Dual Keyframes (Start & End)', rule: 'frame 0 (start) and frame N (end). Model interpolates between both.' },
          { type: 'Arbitrary Keyframe Index', rule: 'Explicit integer index calculated via seconds * fps.' },
        ],
      },
    },
    deprecation_notice: 'Top-level frame_images and reference_images are deprecated; use the unified media object.',
    code_snippets: {
      keyframes_python: `job = client.videos.create(
    prompt="Smooth transition from day to night",
    model="minimax/hailuo-02",
    width=1366,
    height=768,
    fps=24,
    media={
        "frame_images": [{"input_image": base64_image, "frame": "first"}]
    }
)`,
    },
  };
}

// ── 4. Audio-Driven Video Generation ────────────────────────────────────────

export function getAudioInputDocs() {
  return {
    success: true,
    title: 'Audio Input for Video Generation Reference',
    docs_url: 'https://docs.together.ai/docs/inference/videos/audio-input',
    field: 'media.audio_inputs',
    supported_models: ['Wan-AI/wan2.7-t2v', 'Wan-AI/wan2.7-i2v'],
    use_cases: [
      'Lip-sync speech animation synchronized to character dialogue',
      'Beat-matched action and camera motion synchronized to musical tempo',
      'Narration-driven storytelling scenes',
    ],
    audio_constraints: {
      formats: ['WAV', 'MP3'],
      duration_range_seconds: [3, 30],
      max_file_size_mb: 15,
      truncation_rule: 'Audio longer than video duration is truncated at the end.',
      silence_rule: 'Audio shorter than video duration leaves the remaining portion silent.',
      auto_audio_fallback: 'If no audio is provided, models auto-generate matching background music or sound effects.',
    },
    code_snippets: {
      python: `job = client.videos.create(
    prompt="A cartoon kitten general in golden armor commands an army",
    model="Wan-AI/wan2.7-t2v",
    resolution="720P",
    ratio="16:9",
    seconds="10",
    media={
        "audio_inputs": ["https://download.samplelib.com/mp3/sample-3s.mp3"]
    }
)`,
    },
  };
}

// ── 5. Video Parameters Reference & Unified Media Schema ────────────────────

export const MEDIA_OBJECT_SCHEMA = {
  frame_images: {
    type: 'array',
    description: 'Keyframe images for I2V. Items: { input_image: string, frame: "first"|"last"|number }.',
  },
  frame_videos: {
    type: 'array',
    description: 'Input video clips for video continuation. Items: { video: "url" }.',
  },
  reference_images: {
    type: 'array',
    items: { type: 'string' },
    description: 'Reference image URLs for character consistency (R2V) or visual guidance.',
  },
  reference_videos: {
    type: 'array',
    description: 'Reference videos for character consistency. Items: { video: "url" }.',
  },
  source_video: {
    type: 'string',
    description: 'Source video URL to edit or transform (Wan 2.7 specific).',
  },
  audio_inputs: {
    type: 'array',
    items: { type: 'string' },
    description: 'Audio file URLs to drive generation (WAV or MP3, 3-30s, up to 15MB).',
  },
};

export const VIDEO_PARAMETERS_SCHEMA = {
  prompt: {
    type: 'string',
    required: true,
    max_length: 32000,
    description: 'Text description of the video. Include motion verbs and camera cues (e.g. "slowly pans", "tracks left"). Required for all except Kling.',
  },
  model: {
    type: 'string',
    required: true,
    default: 'minimax/video-01-director',
    description: 'Video model identifier string.',
  },
  width: {
    type: 'integer',
    default: 1366,
    description: 'Video width in pixels (MiniMax models).',
  },
  height: {
    type: 'integer',
    default: 768,
    description: 'Video height in pixels (MiniMax models).',
  },
  resolution: {
    type: 'string',
    enum: ['720P', '1080P'],
    default: '1080P',
    description: 'Resolution tier used by Wan 2.7 models instead of width/height.',
  },
  ratio: {
    type: 'string',
    enum: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    default: '16:9',
    description: 'Aspect ratio used by Wan 2.7 models.',
  },
  seconds: {
    type: 'string',
    enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    default: '6',
    description: 'Clip duration in seconds passed as string. Range: 1 through 10.',
  },
  fps: {
    type: 'integer',
    default: 24,
    range: [15, 60],
    description: 'Frames per second. 24 is standard cinematic; up to 60 supported.',
  },
  steps: {
    type: 'integer',
    default: 20,
    range: [10, 50],
    description: 'Denoising diffusion steps. 10 for quick previews, 20 balanced, 30-40 production.',
  },
  guidance_scale: {
    type: 'number',
    default: 8.0,
    range: [6.0, 12.0],
    description: 'Prompt adherence. 6-7 creative, 7-9 sweet spot, 9-10 strict. Values > 12 cause motion artifacts.',
  },
  negative_prompt: {
    type: 'string',
    description: 'Elements to avoid (e.g. "blurry, low quality, distorted, flickering").',
  },
  seed: {
    type: 'integer',
    description: 'Integer seed for reproducible video generation.',
  },
  output_format: {
    type: 'string',
    enum: ['MP4', 'WEBM'],
    default: 'MP4',
    description: 'Encoded video format container.',
  },
  output_quality: {
    type: 'integer',
    default: 20,
    description: 'Compression quality bitrate (lower value means higher fidelity).',
  },
  generate_audio: {
    type: 'boolean',
    default: false,
    description: 'Whether the model should synthesize ambient audio if no audio_inputs passed.',
  },
  media: {
    type: 'object',
    schema: MEDIA_OBJECT_SCHEMA,
    description: 'Unified media input container for keyframes, references, audio, and source videos.',
  },
};

export function getVideoParametersDocs() {
  return {
    success: true,
    title: 'Video Generation Parameters Reference',
    docs_url: 'https://docs.together.ai/docs/inference/videos/parameters',
    schema: VIDEO_PARAMETERS_SCHEMA,
    media_schema: MEDIA_OBJECT_SCHEMA,
    quick_troubleshooting: [
      { problem: 'Video does not match prompt', solution: 'Add camera motion verbs, add negative_prompt, or raise guidance_scale to 9.0-10.0.' },
      { problem: 'Unnatural or jittery motion', solution: 'Lower guidance_scale to 6.0-8.0, and raise steps to 30-40.' },
      { problem: 'Generation takes too long', solution: 'Lower steps to 10 for preview iterations, and shorten seconds to 3-5s.' },
      { problem: 'Need consistent characters across video', solution: 'Pass media.reference_images with character model photos.' },
      { problem: 'Need lip-sync or musical rhythm sync', solution: 'Pass media.audio_inputs with MP3/WAV file between 3-30 seconds.' },
      { problem: 'Need specific starting frame', solution: 'Pass media.frame_images with frame="first".' },
    ],
  };
}

// ── 6. Parameter Validation Engine ──────────────────────────────────────────

export function validateVideoParameters(params = {}) {
  const errors = [];
  const warnings = [];

  const isKling = params.model && params.model.includes('kling');
  if (!isKling) {
    if (!params.prompt || typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      errors.push('prompt is required and must be a non-empty string.');
    } else if (params.prompt.length > 32000) {
      errors.push(`prompt exceeds maximum length of 32,000 characters (length: ${params.prompt.length}).`);
    }
  }

  if (params.seconds !== undefined) {
    const secNum = parseInt(params.seconds, 10);
    if (isNaN(secNum) || secNum < 1 || secNum > 10) {
      errors.push(`seconds ("${params.seconds}") must be a string integer between "1" and "10".`);
    }
  }

  if (params.fps !== undefined) {
    if (typeof params.fps !== 'number' || params.fps < 15 || params.fps > 60) {
      errors.push(`fps (${params.fps}) must be an integer between 15 and 60.`);
    }
  }

  if (params.steps !== undefined) {
    if (typeof params.steps !== 'number' || params.steps < 10 || params.steps > 50) {
      errors.push(`steps (${params.steps}) must be an integer between 10 and 50.`);
    }
  }

  if (params.guidance_scale !== undefined) {
    if (typeof params.guidance_scale !== 'number' || params.guidance_scale < 1.0) {
      errors.push(`guidance_scale (${params.guidance_scale}) must be a positive number.`);
    } else if (params.guidance_scale > 12.0) {
      warnings.push(`guidance_scale (${params.guidance_scale}) exceeds 12.0 and may introduce severe motion artifacts.`);
    }
  }

  if (params.output_format && !['MP4', 'WEBM'].includes(params.output_format.toUpperCase())) {
    errors.push(`output_format "${params.output_format}" is invalid. Allowed: "MP4" or "WEBM".`);
  }

  // Validate media object if provided
  if (params.media && typeof params.media === 'object') {
    if (params.media.audio_inputs && Array.isArray(params.media.audio_inputs)) {
      for (const audioUrl of params.media.audio_inputs) {
        if (typeof audioUrl !== 'string' || (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://'))) {
          errors.push(`media.audio_inputs item "${audioUrl}" must be a valid HTTP/HTTPS URL.`);
        }
      }
    }

    if (params.media.frame_images && Array.isArray(params.media.frame_images)) {
      for (const kf of params.media.frame_images) {
        if (!kf.input_image) {
          errors.push('media.frame_images item must contain input_image.');
        }
        if (kf.frame === undefined) {
          errors.push('media.frame_images item must specify frame ("first", "last", or frame number).');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── 7. Video Job Store & Dispatcher ─────────────────────────────────────────

const inMemoryJobs = new Map();

export async function createVideoJob(params = {}) {
  const startTime = Date.now();
  const model = params.model || 'minimax/video-01-director';
  const jobId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (params.dry_run) {
    const jobData = {
      id: jobId,
      model,
      status: JOB_STATUSES.QUEUED,
      size: `${params.width || 1366}x${params.height || 768}`,
      seconds: String(params.seconds || '6'),
      created_at: new Date().toISOString(),
      prompt: params.prompt || 'A serene sunset over the ocean with gentle waves',
      dry_run: true,
      outputs: null,
    };
    inMemoryJobs.set(jobId, jobData);

    return {
      success: true,
      dry_run: true,
      id: jobId,
      model,
      status: JOB_STATUSES.QUEUED,
      duration_ms: 1,
      job: jobData,
    };
  }

  const rawRes = await executeSharedInference(params, { endpoint: '/v1/videos' });
  const returnedJobId = rawRes.id || jobId;

  return {
    success: true,
    id: returnedJobId,
    model,
    duration_ms: Date.now() - startTime,
    data: rawRes,
  };
}

export async function retrieveVideoJob(jobId, options = {}) {
  if (!jobId) {
    throw new Error('jobId is required to retrieve video job status.');
  }

  // Check in-memory store for dry-run/mock jobs
  if (inMemoryJobs.has(jobId)) {
    const stored = inMemoryJobs.get(jobId);
    // Simulate progression to completed
    if (stored.dry_run && stored.status !== JOB_STATUSES.COMPLETED) {
      stored.status = JOB_STATUSES.COMPLETED;
      stored.completed_at = new Date().toISOString();
      stored.outputs = {
        cost: 0.28,
        video_url: `https://api.together.ai/shrt/mock_${jobId}.mp4`,
      };
    }
    return {
      success: true,
      id: jobId,
      model: stored.model,
      status: stored.status,
      outputs: stored.outputs,
      created_at: stored.created_at,
      completed_at: stored.completed_at,
      data: stored,
    };
  }

  if (options.dry_run) {
    return {
      success: true,
      id: jobId,
      status: JOB_STATUSES.COMPLETED,
      outputs: {
        cost: 0.28,
        video_url: `https://api.together.ai/shrt/mock_${jobId}.mp4`,
      },
    };
  }

  const rawRes = await executeSharedInference({}, { endpoint: `/v1/videos/${jobId}` });
  return {
    success: true,
    id: jobId,
    status: rawRes.status || 'unknown',
    outputs: rawRes.outputs,
    data: rawRes,
  };
}

export default {
  VIDEO_MODELS_CATALOG,
  JOB_STATUSES,
  MEDIA_OBJECT_SCHEMA,
  VIDEO_PARAMETERS_SCHEMA,
  getVideosOverview,
  getReferenceAndKeyframesDocs,
  getAudioInputDocs,
  getVideoParametersDocs,
  calculateKeyframeNumber,
  validateVideoParameters,
  createVideoJob,
  retrieveVideoJob,
};
