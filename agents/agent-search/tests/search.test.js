import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../src/services/searchService.js';
import { runWorkflow } from '../src/agent/workflow.js';

// Mock the GoogleGenAI module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'Mocked search response' }] },
                groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/mock-source', title: 'Mock Source Title' } }] }
              }
            ]
          })
        };
      }
    }
  };
});

describe('Search Agent', () => {
  let searchService;

  beforeEach(() => {
    vi.clearAllMocks();
    searchService = new SearchService();
  });

  it('should initialize SearchService correctly', () => {
    expect(searchService).toBeDefined();
    expect(searchService.model).toBeDefined();
  });

  it('should execute a search and return formatted data', async () => {
    const result = await searchService.executeSearch('What is AI?', []);
    
    expect(result.content).toBe('Mocked search response');
    expect(result.references).toHaveLength(1);
    expect(result.references[0].url).toBe('https://example.com/mock-source');
  });

  it('should run the full workflow correctly', async () => {
    const result = await runWorkflow({ query: 'Tell me about quantum computing' });
    
    expect(result.content).toBe('Mocked search response');
    expect(result.references).toHaveLength(1);
    expect(result.metadata.grounded).toBe(true);
  });
});
