import { describe, it, expect, vi, beforeEach } from 'vitest';
import audioService from '../src/services/audioService.js';
import { runWorkflow } from '../src/agent/workflow.js';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'Mocked audio script' }] }
              }
            ]
          })
        };
      }
    }
  };
});

describe('Audio Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate an audio script correctly', async () => {
    // Stub synthesizeSpeech for the test
    vi.spyOn(audioService, 'synthesizeSpeech').mockResolvedValue({
      audioBase64: 'mock-audio-base64',
      metadata: { voice: 'mock-voice' }
    });

    const result = await runWorkflow({ prompt: 'Create a podcast about AI' });
    expect(result.script).toBe('Mocked audio script');
    expect(result.audioBase64).toBe('mock-audio-base64');
  });
});
