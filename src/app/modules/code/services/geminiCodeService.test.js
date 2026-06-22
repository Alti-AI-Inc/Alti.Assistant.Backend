import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import config from '../../../../../config/index.js';
import {
  codeGenerator,
  codeExplainer,
  codeDebugger,
  bestPracticesAdvisor,
  generalCodeAssistant,
  refineCode,
  routeToSpecializedCodingAgent,
  generateSwarmCode,
} from './geminiCodeService.js';

// Mock external dependencies
vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn();
  const mockGoogleGenAI = vi.fn().mockImplementation(function () {
    return {
      vertexAI: {
        project: 'mock-project',
        location: 'mock-location',
      },
      models: {
        generateContent: mockGenerateContent,
      },
    };
  });
  return { GoogleGenAI: mockGoogleGenAI, mockGenerateContent };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-gcp-project',
      vertex_ai_region: 'test-us-central1',
    },
  },
}));

vi.mock('../../search/services/vertexClaudeService.js', () => ({
  vertexClaudeService: {
    generateText: vi.fn().mockRejectedValue(new Error('Mocked Claude Error for Testing Fallback'))
  },
  default: {
    generateText: vi.fn().mockRejectedValue(new Error('Mocked Claude Error for Testing Fallback'))
  }
}));

// Get the mocked generateContent function
const { mockGenerateContent } = await import('@google/genai');

describe('geminiCodeService', () => {
  const mockHistory = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'Generate a Python function.' },
  ];

  const expectedGeminiContents = [
    { role: 'user', parts: [{ text: 'Hello' }] },
    { role: 'model', parts: [{ text: 'Hi there!' }] }, // 'assistant' mapped to 'model'
    { role: 'user', parts: [{ text: 'Generate a Python function.' }] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementation for generateContent before each test
    mockGenerateContent.mockResolvedValue({ text: 'Mocked Gemini response' });
    vi.spyOn(console, 'error').mockImplementation(() => {}); // Mock console.error
  });

  // Helper to test the common logic of calling runGeminiTask
  async function testServiceFunction(serviceFn, expectedSystemPrompt) {
    const result = await serviceFn(mockHistory, {
      selectedAgent: 'general',
      selectedStyle: 'general',
      selectedPurpose: 'general',
      isSwarm: false,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-pro',
      contents: expectedGeminiContents,
      config: {
        systemInstruction: expectedSystemPrompt,
        temperature: 0.2,
      },
    });
    expect(result).toBe('Mocked Gemini response');
  }

  describe('codeGenerator', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are an expert code generation assistant. Your task is to generate clean, efficient, and well-documented code based on the user's request.
- Analyze the user's request from the conversation history.
- Provide the code in a clear markdown block.
- After the code block, provide a section titled "How to Run" that includes step-by-step commands for running the code.
- This section must include any necessary dependency installation commands (e.g., 'npm install axios', 'pip install requests') and the exact command to execute the code (e.g., 'node index.js', 'python app.py').
- If any other setup is needed (like creating a file or setting environment variables), explain that as well.`;
      await testServiceFunction(codeGenerator, expectedSystemPrompt);
    });
  });

  describe('codeExplainer', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are an expert code explanation assistant. Your task is to explain a piece of code provided by the user.
- Analyze the user's request and the provided code from the conversation history.
- Break down the code into logical parts and explain each part clearly.
- Use analogies if they help clarify complex concepts.`;
      await testServiceFunction(codeExplainer, expectedSystemPrompt);
    });
  });

  describe('codeDebugger', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are an expert code debugging assistant. Your task is to help the user find and fix bugs in their code.
- Analyze the user's problem description and the provided code from the conversation history.
- Identify the likely cause of the bug.
- Suggest a corrected version of the code, highlighting the changes.
- Explain why the bug occurred and how the fix resolves it.`;
      await testServiceFunction(codeDebugger, expectedSystemPrompt);
    });
  });

  describe('bestPracticesAdvisor', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are an expert software engineering advisor. Your task is to review the user's code and suggest improvements based on best practices.
- Analyze the provided code from the conversation history.
- Suggest improvements related to readability, performance, security, and maintainability.
- Provide code examples for your suggestions.`;
      await testServiceFunction(bestPracticesAdvisor, expectedSystemPrompt);
    });
  });

  describe('generalCodeAssistant', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are a helpful and versatile AI coding assistant. Engage in a conversation with the user about their coding needs.
- Answer follow-up questions.
- Refine previously generated code.
- Maintain the context of the conversation to provide relevant and accurate assistance.`;
      await testServiceFunction(generalCodeAssistant, expectedSystemPrompt);
    });
  });

  describe('refineCode', () => {
    it('should call runGeminiTask with the correct system prompt and history', async () => {
      const expectedSystemPrompt = `You are a code refinement assistant. Your task is to improve the user's code based on their feedback.
- Analyze the user's feedback and the provided code from the conversation history.
- Suggest improvements to enhance code quality, readability, and performance.
- Provide a revised version of the code with explanations for the changes made.`;
      await testServiceFunction(refineCode, expectedSystemPrompt);
    });
  });

  // Test internal logic of runGeminiTask via codeGenerator proxy
  describe('runGeminiTask internal logic (via codeGenerator proxy)', () => {
    it('should return "No reply generated" if the Gemini API returns an empty text response', async () => {
      mockGenerateContent.mockResolvedValue({ text: '' }); // Simulate empty response
      const result = await codeGenerator(mockHistory, {
        selectedAgent: 'general',
        selectedStyle: 'general',
        selectedPurpose: 'general',
        isSwarm: false,
      });
      expect(result).toBe('No reply generated');
    });

    it('should return "No reply generated" if the Gemini API returns null/undefined text response', async () => {
      mockGenerateContent.mockResolvedValue({}); // Simulate no text property
      const result = await codeGenerator(mockHistory, {
        selectedAgent: 'general',
        selectedStyle: 'general',
        selectedPurpose: 'general',
        isSwarm: false,
      });
      expect(result).toBe('No reply generated');
    });

    it('should handle API errors gracefully and return a user-friendly message', async () => {
      const apiError = new Error('Gemini API failed');
      mockGenerateContent.mockRejectedValue(apiError); // Simulate API error

      const result = await codeGenerator(mockHistory, {
        selectedAgent: 'general',
        selectedStyle: 'general',
        selectedPurpose: 'general',
        isSwarm: false,
      });

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('Error calling Google Vertex AI for coding task:', apiError);
      expect(result).toBe('Sorry, I encountered an error while processing your request with the coding model. Please try again.');
    });

    it('should filter out messages with unsupported roles', async () => {
      const historyWithUnsupportedRole = [
        { role: 'user', content: 'Valid user message' },
        { role: 'system', content: 'Invalid system message' }, // This should be filtered out
        { role: 'assistant', content: 'Valid assistant message' },
        { role: 'model', content: 'Valid model message' },
      ];

      const expectedFilteredContents = [
        { role: 'user', parts: [{ text: 'Valid user message' }] },
        { role: 'model', parts: [{ text: 'Valid assistant message' }] },
        { role: 'model', parts: [{ text: 'Valid model message' }] },
      ];

      mockGenerateContent.mockResolvedValue({ text: 'Filtered response' });
      await codeGenerator(historyWithUnsupportedRole, {
        selectedAgent: 'general',
        selectedStyle: 'general',
        selectedPurpose: 'general',
        isSwarm: false,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expectedFilteredContents,
        })
      );
    });

    it('should correctly map "model" role to "model" for Gemini', async () => {
      const historyWithModelRole = [
        { role: 'user', content: 'User message' },
        { role: 'model', content: 'Model message' }, // Already 'model', should remain 'model'
      ];

      const expectedContents = [
        { role: 'user', parts: [{ text: 'User message' }] },
        { role: 'model', parts: [{ text: 'Model message' }] },
      ];

      mockGenerateContent.mockResolvedValue({ text: 'Model role test response' });
      await codeGenerator(historyWithModelRole, {
        selectedAgent: 'general',
        selectedStyle: 'general',
        selectedPurpose: 'general',
        isSwarm: false,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expectedContents,
        })
      );
    });
  });

  describe('routeToSpecializedCodingAgent', () => {
    it('should return parsed routing object for valid JSON response', async () => {
      const mockJsonResponse = JSON.stringify({
        typeAgent: 'lang_rust',
        styleAgent: 'style_pep8',
        purposeAgent: 'role_debugger',
        isSwarm: true,
      });
      mockGenerateContent.mockResolvedValueOnce({ text: mockJsonResponse });

      const result = await routeToSpecializedCodingAgent('Write some Rust code');

      expect(result).toEqual({
        typeAgent: 'lang_rust',
        styleAgent: 'style_pep8',
        purposeAgent: 'role_debugger',
        isSwarm: true,
      });
    });

    it('should fallback to general values if JSON is invalid', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: 'invalid-non-json' });

      const result = await routeToSpecializedCodingAgent('Write some Rust code');

      expect(result).toEqual({
        typeAgent: 'general',
        styleAgent: 'general',
        purposeAgent: 'general',
        isSwarm: false,
      });
    });
  });

  describe('generateSwarmCode', () => {
    it('should execute Architect -> Coder -> Tester -> Reviewer -> Documenter -> Editor sequentially', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'Architect Blueprint' })
        .mockResolvedValueOnce({ text: 'Source Code' })
        .mockResolvedValueOnce({ text: 'Unit Tests' })
        .mockResolvedValueOnce({ text: 'Reviewer Feedback' })
        .mockResolvedValueOnce({ text: 'Docs' })
        .mockResolvedValueOnce({ text: 'Final Package' });

      const result = await generateSwarmCode(
        'Write custom sort',
        [{ role: 'user', content: 'Write custom sort' }],
        'lang_rust',
        'style_clean_code',
        'role_performance'
      );

      expect(result).toContain('[Swarm Orchestration Mode Activated]');
      expect(result).toContain('Final Package');
      expect(mockGenerateContent).toHaveBeenCalledTimes(6);
    });
  });

  describe('Routing Integration in codeGenerator', () => {
    it('should execute swarm if state.isSwarm is true', async () => {
      // 1 routing call (if not resolved) + 6 swarm calls
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'Architect Blueprint' })
        .mockResolvedValueOnce({ text: 'Source Code' })
        .mockResolvedValueOnce({ text: 'Unit Tests' })
        .mockResolvedValueOnce({ text: 'Reviewer Feedback' })
        .mockResolvedValueOnce({ text: 'Docs' })
        .mockResolvedValueOnce({ text: 'Final Package' });

      const result = await codeGenerator(
        [{ role: 'user', content: 'Generate code' }],
        { selectedAgent: 'lang_python', isSwarm: true }
      );

      expect(result).toContain('[Swarm Orchestration Mode Activated]');
      expect(result).toContain('Final Package');
    });

    it('should execute single agent with prefix header if not swarm', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: 'def my_func(): pass' });

      const result = await codeGenerator(
        [{ role: 'user', content: 'Generate code' }],
        { selectedAgent: 'lang_python', selectedStyle: 'style_pep8', selectedPurpose: 'role_debugger', isSwarm: false }
      );

      expect(result).toContain('Active Specialist:** *Python Specialist*');
      expect(result).toContain('Style**: *PEP 8 Style compliance Analyst*');
      expect(result).toContain('Focus**: *Debugging Assistant*');
      expect(result).toContain('def my_func(): pass');
    });
  });
});