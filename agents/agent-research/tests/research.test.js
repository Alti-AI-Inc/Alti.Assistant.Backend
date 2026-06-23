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
                content: { parts: [{ text: '{"queries":["mock query"],"rationale":"mock rationale"}' }] },
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
    expect(result[0]).toBe('{"queries":["mock query"],"rationale":"mock rationale"}');
  });

  it('should execute the deep research workflow', async () => {
    // We mock the DB and PDF services inside if needed, or rely on them failing gracefully.
    // For unit testing the workflow, we can pass a dummy topic.
    vi.spyOn(researchService, 'saveResearch').mockResolvedValue({ savedId: 'mock-saved-path' });
    vi.spyOn(researchService, 'generatePdf').mockResolvedValue({ pdfUrl: 'mock-pdf-path' });
    
    const result = await runWorkflow({ topic: 'Test topic' });
    
    expect(result.refinedSynthesis).toBe('{"queries":["mock query"],"rationale":"mock rationale"}');
    expect(result.status).toBe('completed');
  });
});
