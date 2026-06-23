import { describe, it, expect, vi, beforeEach } from 'vitest';
import videoService from '../src/services/videoService.js';
import { runWorkflow } from '../src/agent/workflow.js';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'Mocked video prompt enhancement' }] }
              }
            ]
          })
        };
      }
    }
  };
});

describe('Video Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enhance a video prompt correctly', async () => {
    // Stub generateVideo for the test
    vi.spyOn(videoService, 'generateVideo').mockResolvedValue({
      videoUrl: 'https://mock-video-url.com/video.mp4',
      metadata: { duration: 5 }
    });

    const result = await runWorkflow({ prompt: 'A dog running' });
    expect(result.enhancedPrompt).toBe('Mocked video prompt enhancement');
    expect(result.videoUrl).toBe('https://mock-video-url.com/video.mp4');
  });
});
