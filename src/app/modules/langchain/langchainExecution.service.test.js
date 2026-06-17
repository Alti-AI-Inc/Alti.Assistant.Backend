import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the service file
// This ensures that `const genAI = new GoogleGenerativeAI(...)` in the service file
// uses our mocked GoogleGenerativeAI.
const mockGenerateContent = vi.fn();
const {
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  return {
    mockGetGenerativeModel
  };
});
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
    gcs: {
      presentation_bucket: 'mock-gcs-bucket',
    },
  },
}));
vi.mock('../../../shared/logger.js');
vi.mock('./langchain-chain.model.js');
vi.mock('./langchain-execution.model.js');
vi.mock('../llamaindex/llamaindex.service.js');
vi.mock('fs');
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolve: vi.fn().mockImplementation((p) => p), // Mock resolve to return path directly for testing relative paths
    join: vi.fn().mockImplementation((...args) => args.join('/')), // Mock join for consistent path strings
  };
});

// Now import the service file, after all necessary mocks are set up
import { LangchainExecutionService } from './langchainExecution.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Import the mocked version

// Mock LangchainChain model
const mockChainFindByIdLean = vi.fn();
LangchainChain.findById = vi.fn().mockImplementation(() => ({
  lean: mockChainFindByIdLean,
}));

// Mock LangchainExecution model
const mockExecutionSave = vi.fn();
const mockExecutionToJSON = vi.fn();
LangchainExecution.mockImplementation((data) => ({
  ...data,
  _id: 'mockExecutionId',
  save: mockExecutionSave,
  toJSON: mockExecutionToJSON,
}));

describe('LangchainExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations for each test
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'LLM response text',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      },
    });
    mockGetGenerativeModel.mockClear();
    GoogleGenerativeAI.mockClear(); // Clear calls to the constructor

    mockChainFindByIdLean.mockResolvedValue({
      _id: 'mockChainId',
      name: 'Test Chain',
      steps: [],
    });

    mockExecutionSave.mockResolvedValue(true);
    mockExecutionToJSON.mockReturnValue({}); // Default empty object for toJSON

    ragService.queryDocument.mockResolvedValue('Retrieved context');

    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);

    logger.error.mockImplementation(() => {});
    logger.warn.mockImplementation(() => {});
  });

  // executeSteps tests
  describe('executeSteps', () => {
    const executeSteps = LangchainExecutionService.executeSteps;
    const userId = 'testUserId';

    it('should execute a single prompt step with basic template', async () => {
      const steps = [{ name: 'step1', type: 'prompt', config: { template: 'Hello World' } }];
      const inputs = {};

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.step1).toBe('Hello World');
      expect(result.stepsExecution).toHaveLength(1);
      expect(result.stepsExecution[0].stepName).toBe('step1');
      expect(result.stepsExecution[0].stepType).toBe('prompt');
      expect(result.stepsExecution[0].output).toBe('Hello World');
      expect(result.tokenUsage.totalTokens).toBe(0);
    });

    it('should execute a prompt step with variables from inputs', async () => {
      const steps = [{ name: 'step1', type: 'prompt', config: { template: 'Hello {name}, your age is {age}.' } }];
      const inputs = { name: 'Alice', age: 30 };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.step1).toBe('Hello Alice, your age is 30.');
    });

    it('should execute a prompt step with missing variables in scope', async () => {
      const steps = [{ name: 'step1', type: 'prompt', config: { template: 'Hello {name}, your age is {age}.' } }];
      const inputs = { name: 'Alice' }; // 'age' is missing

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.step1).toBe('Hello Alice, your age is .');
    });

    it('should execute a prompt step with object variable as JSON string', async () => {
      const steps = [{ name: 'step1', type: 'prompt', config: { template: 'User: {user_data}' } }];
      const inputs = { user_data: { id: 1, name: 'Bob' } };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.step1).toBe('User: {"id":1,"name":"Bob"}');
    });

    it('should execute a single llm step', async () => {
      const steps = [{ name: 'llmStep', type: 'llm', config: { promptSource: 'inputPrompt', model: 'gemini-pro' } }];
      const inputs = { inputPrompt: 'What is the capital of France?' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.llmStep).toBe('LLM response text');
      expect(result.stepsExecution).toHaveLength(1);
      expect(result.stepsExecution[0].stepName).toBe('llmStep');
      expect(result.stepsExecution[0].stepType).toBe('llm');
      expect(result.stepsExecution[0].output).toBe('LLM response text');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-pro' });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: 'What is the capital of France?' }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      });
      expect(result.tokenUsage.promptTokens).toBe(10);
      expect(result.tokenUsage.completionTokens).toBe(5);
      expect(result.tokenUsage.totalTokens).toBe(15);
    });

    it('should use default LLM config values if not provided', async () => {
      const steps = [{ name: 'llmStep', type: 'llm', config: { promptSource: 'inputPrompt' } }];
      const inputs = { inputPrompt: 'Hello' };

      await executeSteps(steps, inputs, userId);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        })
      );
    });

    it('should use systemPrompt if promptSource is empty or not found', async () => {
      const steps = [{ name: 'llmStep', type: 'llm', config: { systemPrompt: 'System prompt text' } }];
      const inputs = {};

      await executeSteps(steps, inputs, userId);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: 'System prompt text' }] }],
        })
      );
    });

    it('should execute a parser step with valid JSON', async () => {
      const steps = [{ name: 'parserStep', type: 'parser', config: { sourceVariable: 'jsonInput' } }];
      const inputs = { jsonInput: '{"key": "value", "num": 123}' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.parserStep).toEqual({ key: 'value', num: 123 });
      expect(result.stepsExecution[0].output).toEqual({ key: 'value', num: 123 });
    });

    it('should execute a parser step with JSON in code block', async () => {
      const steps = [{ name: 'parserStep', type: 'parser', config: { sourceVariable: 'jsonInput' } }];
      const inputs = { jsonInput: '```json\n{"key": "value", "num": 123}\n```' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.parserStep).toEqual({ key: 'value', num: 123 });
    });

    it('should execute a parser step with invalid JSON and extract fields', async () => {
      const steps = [
        {
          name: 'parserStep',
          type: 'parser',
          config: { sourceVariable: 'textInput', expectedFields: ['name', 'age'] },
        },
      ];
      const inputs = { textInput: 'Some text. "name": "Bob", "age": "30". More text.' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.parserStep).toEqual({ name: 'Bob', age: '30' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('JSON parser failed'));
    });

    it('should execute a parser step with invalid JSON and no fields extracted', async () => {
      const steps = [
        {
          name: 'parserStep',
          type: 'parser',
          config: { sourceVariable: 'textInput', expectedFields: ['nonExistentField'] },
        },
      ];
      const inputs = { textInput: 'Some text. "name": "Bob".' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.parserStep).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('JSON parser failed'));
    });

    it('should execute a retriever step', async () => {
      const steps = [{ name: 'retrieverStep', type: 'retriever', config: { queryTemplate: 'Find info about {topic}' } }];
      const inputs = { topic: 'AI' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(ragService.queryDocument).toHaveBeenCalledWith('Find info about AI', userId);
      expect(result.outputs.retrieverStep).toBe('Retrieved context');
      expect(result.stepsExecution[0].output).toBe('Retrieved context');
    });

    it('should execute a tool step', async () => {
      const steps = [
        {
          name: 'toolStep',
          type: 'tool',
          config: { toolName: 'myTool', params: { param1: 'value1', param2: '{dynamicVar}' } },
        },
      ];
      const inputs = { dynamicVar: 'dynamicValue' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.toolStep).toEqual(
        expect.objectContaining({
          executed: true,
          tool: 'myTool',
          result: 'Mock successful trigger of tool: myTool',
        })
      );
      expect(result.stepsExecution[0].input.params).toEqual({ param1: 'value1', param2: 'dynamicValue' });
    });

    it('should execute a branch step with "equals" match and thenSteps', async () => {
      const steps = [
        {
          name: 'branchStep',
          type: 'branch',
          config: {
            conditionVariable: 'status',
            operator: 'equals',
            value: 'approved',
            thenSteps: [{ name: 'thenPrompt', template: 'Status is {status}' }],
          },
        },
      ];
      const inputs = { status: 'approved' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.branchStep.match).toBe(true);
      expect(result.outputs.thenPrompt).toBe('Status is approved');
      expect(result.stepsExecution).toHaveLength(2); // branch step + thenPrompt
      expect(result.stepsExecution[1].stepName).toBe('branchStep_then_thenPrompt');
      expect(result.stepsExecution[1].output).toBe('Status is approved');
    });

    it('should execute a branch step with "equals" no match and no thenSteps', async () => {
      const steps = [
        {
          name: 'branchStep',
          type: 'branch',
          config: {
            conditionVariable: 'status',
            operator: 'equals',
            value: 'approved',
            thenSteps: [{ name: 'thenPrompt', template: 'Status is {status}' }],
          },
        },
      ];
      const inputs = { status: 'pending' };

      const result = await executeSteps(steps, inputs, userId);

      expect(result.success).toBe(true);
      expect(result.outputs.branchStep.match).toBe(false);
      expect(result.outputs.thenPrompt).toBeUndefined();
      expect(result.stepsExecution).toHaveLength(1); // Only branch step
    });

    it('should execute a branch step with "contains" match', async () => {
      const steps = [
        {
          name: 'branchStep',
          type: 'branch',
          config: {
            conditionVariable: 'text',
            operator: 'contains',
            value: 'keyword',
          },
        },
      ];
      const inputs = { text: 'This text contains a keyword.' };

      const result = await executeSteps(steps, inputs, userId);
      expect(result.outputs.branchStep.match).toBe(true);
    });

    it('should execute a branch step with "greaterThan" match', async () => {
      const steps = [
        {
          name: 'branchStep',
          type: 'branch',
          config: {
            conditionVariable: 'number',
            operator: 'greaterThan',
            value: 10,
          },
        },
      ];
      const inputs = { number: 15 };

      const result = await executeSteps(steps, inputs, userId);
      expect(result.outputs.branchStep.match).toBe(true);
    });

    it('should throw error for unsupported step type', async () => {
      const steps = [{ name: 'badStep', type: 'unsupported', config: {} }];
      const inputs = {};

      await expect(executeSteps(steps, inputs, userId)).rejects.toThrow('Unsupported chain step type: unsupported');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Chain step [badStep] failed:'), expect.any(Error));
      // The finally block ensures the step is recorded even if it throws
      // However, the function itself rejects, so no return value to check stepsExecution
    });

    it('should record a failed step and re-throw the error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('LLM API error'));
      const steps = [{ name: 'llmStep', type: 'llm', config: { promptSource: 'inputPrompt' } }];
      const inputs = { inputPrompt: 'Fail me' };

      await expect(executeSteps(steps, inputs, userId)).rejects.toThrow('LLM API error');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Chain step [llmStep] failed:'), expect.any(Error));
    });
  });

  // executeChain tests
  describe('executeChain', () => {
    const executeChain = LangchainExecutionService.executeChain;
    const chainId = 'mockChainId';
    const userId = 'testUserId';
    const inputs = { initial: 'value' };

    it('should throw error if chain not found', async () => {
      mockChainFindByIdLean.mockResolvedValue(null);

      await expect(executeChain(chainId, inputs, userId)).rejects.toThrow(`LangChain chain not found: ${chainId}`);
      expect(LangchainExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId,
          userId,
          inputs,
          status: 'running',
        })
      );
      // It saves as 'running' then attempts to execute, fails, then saves as 'failed'
      expect(mockExecutionSave).toHaveBeenCalledTimes(2);
      expect(mockExecutionSave).toHaveBeenNthCalledWith(2); // The second save is for the failed status
      expect(mockExecutionToJSON).not.toHaveBeenCalled(); // No successful execution to log
    });

    it('should successfully execute a chain and save results', async () => {
      const mockSteps = [
        { name: 'step1', type: 'prompt', config: { template: 'Hello {name}' } },
        { name: 'step2', type: 'llm', config: { promptSource: 'step1' } },
      ];
      mockChainFindByIdLean.mockResolvedValue({
        _id: chainId,
        name: 'Test Chain',
        steps: mockSteps,
      });

      const mockExecutionInstance = {
        _id: 'mockExecutionId',
        chainId,
        userId,
        inputs,
        status: 'running',
        save: mockExecutionSave,
        toJSON: mockExecutionToJSON.mockReturnValue({ // Mock toJSON for the GCS log backup
          _id: 'mockExecutionId',
          status: 'success',
          stepsExecution: [
            { stepName: 'step1', stepType: 'prompt', output: 'Hello World' },
            { stepName: 'step2', stepType: 'llm', output: 'LLM response text' },
          ],
          outputs: { name: 'World', step1: 'Hello World', step2: 'LLM response text' },
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
      };
      LangchainExecution.mockImplementationOnce(() => mockExecutionInstance);

      const result = await executeChain(chainId, { name: 'World' }, userId);

      expect(LangchainExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId,
          userId,
          inputs: { name: 'World' },
          status: 'running',
        })
      );
      expect(mockExecutionSave).toHaveBeenCalledTimes(2); // Initial save and final save
      expect(mockExecutionInstance.status).toBe('success');
      expect(mockExecutionInstance.stepsExecution).toHaveLength(2);
      expect(mockExecutionInstance.outputs).toEqual(expect.objectContaining({ name: 'World', step1: 'Hello World', step2: 'LLM response text' }));
      expect(mockExecutionInstance.totalDurationMs).toBeGreaterThan(0);
      expect(mockExecutionInstance.tokenUsage.totalTokens).toBe(15);
      expect(result).toEqual(mockExecutionInstance);

      expect(fs.existsSync).toHaveBeenCalledWith('storage/ragsystem/telemetry');
      expect(fs.mkdirSync).not.toHaveBeenCalled(); // Because existsSync returns true
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'storage/ragsystem/telemetry/lcel_execution_mockExecutionId.json',
        JSON.stringify(mockExecutionToJSON(), null, 2)
      );
      expect(mockExecutionInstance.gcsLogUri).toBe('gs://mock-gcs-bucket/lcel_logs/lcel_execution_mockExecutionId.json');
    });

    it('should handle errors during step execution and update execution status', async () => {
      mockGenerateContent.mockRejectedValue(new Error('LLM failure'));
      const mockSteps = [{ name: 'step1', type: 'llm', config: { promptSource: 'inputPrompt' } }];
      mockChainFindByIdLean.mockResolvedValue({
        _id: chainId,
        name: 'Test Chain',
        steps: mockSteps,
      });

      const mockExecutionInstance = {
        _id: 'mockExecutionId',
        chainId,
        userId,
        inputs,
        status: 'running',
        save: mockExecutionSave,
        toJSON: mockExecutionToJSON,
      };
      LangchainExecution.mockImplementationOnce(() => mockExecutionInstance);

      await expect(executeChain(chainId, inputs, userId)).rejects.toThrow('LLM failure');

      expect(mockExecutionSave).toHaveBeenCalledTimes(2); // Initial save and failed save
      expect(mockExecutionInstance.status).toBe('failed');
      expect(mockExecutionInstance.totalDurationMs).toBeGreaterThan(0);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Chain step [step1] failed:'), expect.any(Error));
      expect(fs.writeFileSync).not.toHaveBeenCalled(); // Should not write log on failure
    });

    it('should create directory if it does not exist for GCS log backup', async () => {
      fs.existsSync.mockReturnValue(false);
      const mockSteps = [{ name: 'step1', type: 'prompt', config: { template: 'Hello' } }];
      mockChainFindByIdLean.mockResolvedValue({
        _id: chainId,
        name: 'Test Chain',
        steps: mockSteps,
      });

      const mockExecutionInstance = {
        _id: 'mockExecutionId',
        chainId,
        userId,
        inputs,
        status: 'running',
        save: mockExecutionSave,
        toJSON: mockExecutionToJSON.mockReturnValue({
          _id: 'mockExecutionId',
          status: 'success',
          stepsExecution: [],
          outputs: {},
          tokenUsage: {},
        }),
      };
      LangchainExecution.mockImplementationOnce(() => mockExecutionInstance);

      await executeChain(chainId, inputs, userId);

      expect(fs.mkdirSync).toHaveBeenCalledWith('storage/ragsystem/telemetry', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});