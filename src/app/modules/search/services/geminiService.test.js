import {
  vi,
  describe,
  it,
  expect
} from 'vitest';

// Mock the multiCloudModelService.js dependency
const mockMcSelectModelSmart = vi.fn(() => 'mockSelectModelSmart');
const mockMcSelectModel = vi.fn(() => 'mockSelectModel');
const mockMcCreateToolEnabledLLM = vi.fn(() => 'mockToolEnabledLLMInstance');
const mockMcCreateToolEnabledLLMExplicit = vi.fn(() => 'mockToolEnabledLLMExplicitInstance');
const mockMcGemini2_5Flash = 'mockGemini2_5FlashInstance';
const mockMcGemini3ProPreview = 'mockGemini3ProPreviewInstance';

vi.mock('./multiCloudModelService.js', () => ({
  selectModelSmart: mockMcSelectModelSmart,
  selectModel: mockMcSelectModel,
  createToolEnabledLLM: mockMcCreateToolEnabledLLM,
  createToolEnabledLLMExplicit: mockMcCreateToolEnabledLLMExplicit,
  gemini2_5Flash: mockMcGemini2_5Flash,
  gemini3ProPreview: mockMcGemini3ProPreview,
}));

// Import the module under test AFTER mocking its dependencies
import geminiService, {
  ModelComplexity,
  gemini2_5Flash,
  gemini3ProPreview,
  selectModelSmart,
  selectModel,
  createToolEnabledLLM,
  createToolEnabledLLMExplicit,
  llm,
  toolEnabledLLM,
} from './geminiService.js';

describe('geminiService', () => {

  it('should export ModelComplexity constants correctly', () => {
    expect(ModelComplexity).toEqual({
      SIMPLE: 'simple',
      COMPLEX: 'complex',
    });
    expect(geminiService.ModelComplexity).toEqual({
      SIMPLE: 'simple',
      COMPLEX: 'complex',
    });
  });

  it('should correctly proxy gemini2_5Flash', () => {
    expect(gemini2_5Flash).toBe(mockMcGemini2_5Flash);
    expect(geminiService.gemini2_5Flash).toBe(mockMcGemini2_5Flash);
  });

  it('should correctly proxy gemini3ProPreview', () => {
    expect(gemini3ProPreview).toBe(mockMcGemini3ProPreview);
    expect(geminiService.gemini3ProPreview).toBe(mockMcGemini3ProPreview);
  });

  it('should correctly proxy selectModelSmart', () => {
    expect(selectModelSmart).toBe(mockMcSelectModelSmart);
    expect(geminiService.selectModelSmart).toBe(mockMcSelectModelSmart);
    // Verify it's the actual mocked function
    selectModelSmart();
    expect(mockMcSelectModelSmart).toHaveBeenCalledTimes(1);
    expect(selectModelSmart()).toBe('mockSelectModelSmart');
  });

  it('should correctly proxy selectModel', () => {
    expect(selectModel).toBe(mockMcSelectModel);
    expect(geminiService.selectModel).toBe(mockMcSelectModel);
    // Verify it's the actual mocked function
    selectModel();
    expect(mockMcSelectModel).toHaveBeenCalledTimes(1);
    expect(selectModel()).toBe('mockSelectModel');
  });

  it('should correctly proxy createToolEnabledLLM', () => {
    expect(createToolEnabledLLM).toBe(mockMcCreateToolEnabledLLM);
    expect(geminiService.createToolEnabledLLM).toBe(mockMcCreateToolEnabledLLM);
    // Verify it's the actual mocked function
    createToolEnabledLLM();
    expect(mockMcCreateToolEnabledLLM).toHaveBeenCalledTimes(2); // Once for toolEnabledLLM, once here
    expect(createToolEnabledLLM()).toBe('mockToolEnabledLLMInstance');
  });

  it('should correctly proxy createToolEnabledLLMExplicit', () => {
    expect(createToolEnabledLLMExplicit).toBe(mockMcCreateToolEnabledLLMExplicit);
    expect(geminiService.createToolEnabledLLMExplicit).toBe(mockMcCreateToolEnabledLLMExplicit);
    // Verify it's the actual mocked function
    createToolEnabledLLMExplicit();
    expect(mockMcCreateToolEnabledLLMExplicit).toHaveBeenCalledTimes(1);
    expect(createToolEnabledLLMExplicit()).toBe('mockToolEnabledLLMExplicitInstance');
  });

  it('should export llm as gemini2_5Flash', () => {
    expect(llm).toBe(gemini2_5Flash);
    expect(llm).toBe(mockMcGemini2_5Flash);
    expect(geminiService.llm).toBe(mockMcGemini2_5Flash);
  });

  it('should export toolEnabledLLM as the result of createToolEnabledLLM()', () => {
    expect(toolEnabledLLM).toBe('mockToolEnabledLLMInstance');
    expect(geminiService.toolEnabledLLM).toBe('mockToolEnabledLLMInstance');
    // Ensure createToolEnabledLLM was called exactly once during module load for toolEnabledLLM
    expect(mockMcCreateToolEnabledLLM).toHaveBeenCalledTimes(1);
  });

  it('should have a default export containing all named exports', () => {
    expect(geminiService).toEqual({
      ModelComplexity: ModelComplexity,
      gemini2_5Flash: gemini2_5Flash,
      gemini3ProPreview: gemini3ProPreview,
      selectModelSmart: selectModelSmart,
      selectModel: selectModel,
      createToolEnabledLLM: createToolEnabledLLM,
      createToolEnabledLLMExplicit: createToolEnabledLLMExplicit,
      llm: llm,
      toolEnabledLLM: toolEnabledLLM,
    });
  });
});