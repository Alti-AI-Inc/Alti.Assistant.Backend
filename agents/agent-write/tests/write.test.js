import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WriteService } from '../src/services/writeService.js';
import { runWorkflow } from '../src/agent/workflow.js';



describe('Write Agent', () => {
  let writeService;

  beforeEach(() => {
    vi.clearAllMocks();
    writeService = new WriteService();
  });

  it('should initialize correctly', () => {
    expect(writeService).toBeDefined();
  });

  it('should execute write task correctly', async () => {
    vi.spyOn(WriteService.prototype, 'callClaude').mockResolvedValue({ text: 'Mocked writing text', usage: {} });
    const result = await writeService.generateDocument('Topic', { style: 'formal' });
    expect(result.content).toContain('Mocked writing text');
  });

  it('should execute the workflow', async () => {
    vi.spyOn(WriteService.prototype, 'callClaude').mockResolvedValue({ text: 'Mocked writing text', usage: {} });
    // For formatAndExport, it expects JSON in the final stage, so let's mock it specifically or mock the final result output
    const mockJson = JSON.stringify({ 
      finalDocument: 'Mocked writing text', 
      metadata: { readingLevel: 10, tone: 'formal', estimatedReadingTimeMinutes: 2 } 
    });
    vi.spyOn(WriteService.prototype, 'callClaude').mockResolvedValue({ text: mockJson, usage: {} });
    const result = await runWorkflow({ prompt: 'Write an essay' });
    // It returns result.finalDocument in the workflow state, or result.content depending on the workflow output mapping
    expect(result.finalDocument || result.content).toContain('Mocked writing text');
  });
});
