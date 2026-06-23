import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeService } from '../src/services/codeService.js';



describe('Code Agent', () => {
  let codeService;

  beforeEach(() => {
    vi.clearAllMocks();
    codeService = new CodeService();
  });

  it('should initialize correctly', () => {
    expect(codeService).toBeDefined();
  });

  it('should execute code task correctly', async () => {
    const result = await codeService.generateCode('Write a loop', { language: 'js' });
    expect(result.code).toBe('Mocked writing text');
  });

});
