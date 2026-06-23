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
    const result = await writeService.generateDocument('Topic', { style: 'formal' });
    expect(result.content).toBe('Mocked writing text');
  });

  it('should execute the workflow', async () => {
    const result = await runWorkflow({ prompt: 'Write an essay' });
    expect(result.content).toBe('Mocked writing text');
  });
});
