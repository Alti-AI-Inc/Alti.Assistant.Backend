import { describe, it, expect, vi, beforeEach } from 'vitest';
import researchService from '../src/services/researchService.js';
import { runWorkflow } from '../src/agent/workflow.js';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'Mocked research text' }] },
                groundingMetadata: { groundingChunks: [] }
              }
            ]
          })
        };
      }
    }
  };
});

describe('Research Agent', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize ResearchService correctly', () => {
    expect(researchService).toBeDefined();
  });

  it('should perform breadthSearch correctly', async () => {
    const result = await researchService.breadthSearch('Topic', ['term1', 'term2']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Mocked research text');
  });

  it('should execute the deep research workflow', async () => {
    // We mock the DB and PDF services inside if needed, or rely on them failing gracefully.
    // For unit testing the workflow, we can pass a dummy topic.
    vi.spyOn(researchService, 'saveResearch').mockResolvedValue('mock-saved-path');
    vi.spyOn(researchService, 'generatePdf').mockResolvedValue('mock-pdf-path');
    
    const result = await runWorkflow({ prompt: 'Test topic' });
    
    expect(result.report).toBe('Mocked research text');
    expect(result.metadata.nodesExecuted).toBeGreaterThan(0);
  });
});
