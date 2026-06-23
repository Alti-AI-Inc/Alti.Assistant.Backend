import { describe, it, expect, vi, beforeEach } from 'vitest';
import imageService from '../src/services/imageService.js';
import { runWorkflow } from '../src/agent/workflow.js';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: vi.fn().mockImplementation(async (req) => {
            if (req.model.includes('image')) {
              return {
                candidates: [ { content: { parts: [
                  { text: 'Mocked accompaniment text' },
                  { inlineData: { data: 'mock-base64-bytes' } }
                ] } } ]
              };
            }
            return {
              candidates: [ { content: { parts: [{ text: 'Enhanced prompt mock' }] } } ]
            };
          })
        };
      }
    }
  };
});

describe('Image Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate an image correctly', async () => {
    const result = await imageService.generateImage('Draw a cat');
    expect(result.imageUrl).toContain('placeholder-bucket');
    expect(result.text).toBe('Mocked accompaniment text');
  });

  it('should execute the workflow', async () => {
    const result = await runWorkflow({ prompt: 'Draw a cat', options: { preferences: { size: 'standard' } } });
    expect(result.imageUrl).toContain('mock-base64-bytes');
  });
});
