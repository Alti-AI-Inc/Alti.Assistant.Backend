import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { langchainStreamService } from './langchainStream.service.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ragService } from '../llamaindex/llamaindex.service.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';

// Mock dependencies
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockExecutionSave = vi.fn().mockResolvedValue(true);

const {
  mockExecutionInstance,
  mockLean,
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockExecutionInstance = {
    _id: 'exec_12345',
    save: mockExecutionSave,
    status: 'running',
    stepsExecution: [],
    outputs: {},
    totalDurationMs: 0,
    tokenUsage: {},
  };

  const mockLean = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  return {
    mockExecutionInstance,
    mockLean,
    mockGetGenerativeModel
  };
});

vi.mock('./langchain-execution.model.js', () => ({
  default: vi.fn().mockImplementation(() => mockExecutionInstance),
}));

vi.mock('./langchain-chain.model.js', () => ({
  default: {
    findById: vi.fn().mockReturnThis(),
    lean: mockLean,
  },
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

vi.mock('../llamaindex/llamaindex.service.js', () => ({
  ragService: {
    queryDocument: vi.fn(),
  },
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-key',
  },
}));

describe('langchainStreamService', () => {
  let emit;

  beforeEach(() => {
    emit = vi.fn();
    vi.clearAllMocks();
    // Reset the mock instance state for each test
    Object.assign(mockExecutionInstance, {
      status: 'running',
      stepsExecution: [],
      outputs: {},
      totalDurationMs: 0,
      tokenUsage: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('streamChainExecution', () => {
    const chainId = 'chain_123';
    const userId = 'user_abc';
    const inputs = { query: 'What is Alti.Assistant?' };

    const mockChain = {
      _id: chainId,
      name: 'Test Chain',
      steps: [
        { name: 'format_prompt', type: 'prompt', config: { template: 'Question: {query}' } },
        { name: 'call_llm', type: 'llm', config: { promptSource: 'format_prompt', model: 'gemini-pro' } },
        { name: 'parse_json', type: 'parser', config: { sourceVariable: 'call_llm', expectedFields: ['answer'] } },
      ],
    };

    it('should successfully execute a multi-step chain and emit correct events', async () => {
      mockLean.mockResolvedValue(mockChain);
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '```json\n{"answer": "It is an AI assistant."}\n```',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        },
      });

      await langchainStreamService.streamChainExecution(chainId, inputs, userId, emit);

      // Check emit calls
      expect(emit).toHaveBeenCalledTimes(8); // start, step1_start, step1_complete, step2_start, step2_complete, step3_start, step3_complete, done
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'start', chainName: 'Test Chain' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'format_prompt' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_complete', stepName: 'format_prompt' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'call_llm' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_complete', stepName: 'call_llm' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'parse_json' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_complete', stepName: 'parse_json' }));
      const doneCall = emit.mock.calls.find(call => call[0].event === 'done');
      expect(doneCall[0]).toMatchObject({
        event: 'done',
        success: true,
        executionId: 'exec_12345',
        finalOutputs: {
          query: 'What is Alti.Assistant?',
          format_prompt: 'Question: What is Alti.Assistant?',
          call_llm: '```json\n{"answer": "It is an AI assistant."}\n```',
          parse_json: { answer: 'It is an AI assistant.' },
        },
      });

      // Check DB interactions
      expect(LangchainChain.findById).toHaveBeenCalledWith(chainId);
      expect(LangchainExecution).toHaveBeenCalledWith({ chainId, userId, inputs, status: 'running' });
      expect(mockExecutionSave).toHaveBeenCalledTimes(2); // once at start, once at end
      expect(mockExecutionInstance.status).toBe('success');
      expect(mockExecutionInstance.stepsExecution.length).toBe(3);
      expect(mockExecutionInstance.stepsExecution[2].status).toBe('success');
    });

    it('should handle a chain not found error', async () => {
      mockLean.mockResolvedValue(null);

      await langchainStreamService.streamChainExecution(chainId, inputs, userId, emit);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith({ event: 'error', message: `Chain not found: ${chainId}` });
      expect(LangchainExecution).not.toHaveBeenCalled();
    });

    it('should handle a step failure and halt execution', async () => {
      mockLean.mockResolvedValue(mockChain);
      const stepError = new Error('LLM API is down');
      mockGenerateContent.mockRejectedValue(stepError);

      await langchainStreamService.streamChainExecution(chainId, inputs, userId, emit);

      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'start' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'format_prompt' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_complete', stepName: 'format_prompt' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'call_llm' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_error', stepName: 'call_llm', error: 'LLM generation failed: LLM API is down' }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'done', success: false, error: 'LLM generation failed: LLM API is down' }));
      expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'step_start', stepName: 'parse_json' }));

      expect(mockExecutionSave).toHaveBeenCalledTimes(2);
      expect(mockExecutionInstance.status).toBe('failed');
      expect(mockExecutionInstance.stepsExecution.length).toBe(2);
      expect(mockExecutionInstance.stepsExecution[1]).toMatchObject({
        stepName: 'call_llm',
        status: 'failed',
        error: 'LLM generation failed: LLM API is down',
      });
    });

    it('should handle a general error during execution setup', async () => {
      const setupError = new Error('DB connection failed');
      mockLean.mockRejectedValue(setupError);

      await langchainStreamService.streamChainExecution(chainId, inputs, userId, emit);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith({ event: 'error', message: 'DB connection failed' });
      expect(logger.error).toHaveBeenCalledWith('StreamChain execution failed:', expect.any(Object));
    });

    it('should correctly pass userId to the retriever step for context boundary check', async () => {
      const retrieverChain = {
        _id: 'retriever_chain_123',
        name: 'Retriever Test Chain',
        steps: [
          { name: 'retrieve_docs', type: 'retriever', config: { queryTemplate: 'Find docs about {topic}' } },
        ],
      };
      mockLean.mockResolvedValue(retrieverChain);
      ragService.queryDocument.mockResolvedValue('Some context about the topic.');

      const retrieverInputs = { topic: 'security' };
      const specificUserId = 'user_with_specific_access';

      await langchainStreamService.streamChainExecution('retriever_chain_123', retrieverInputs, specificUserId, emit);

      expect(ragService.queryDocument).toHaveBeenCalledWith('Find docs about security', specificUserId);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'done', success: true }));
    });

    describe('Individual Step Execution Tests', () => {
      it('should execute a "retriever" step and handle its failure', async () => {
        const retrieverChain = {
          _id: 'retriever_chain_123',
          name: 'Retriever Fail Chain',
          steps: [{ name: 'retrieve_docs', type: 'retriever', config: { queryTemplate: '{topic}' } }],
        };
        mockLean.mockResolvedValue(retrieverChain);
        const ragError = new Error('Vector DB is offline');
        ragService.queryDocument.mockRejectedValue(ragError);

        await langchainStreamService.streamChainExecution('retriever_chain_123', { topic: 'anything' }, userId, emit);

        expect(ragService.queryDocument).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_error', error: 'RAG retrieval failed: Vector DB is offline' }));
        expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'done', success: false }));
      });

      it('should execute a "branch" step correctly (matching case)', async () => {
        const branchChain = {
          _id: 'branch_chain_123',
          name: 'Branch Test Chain',
          steps: [{ name: 'check_condition', type: 'branch', config: { conditionVariable: 'status', operator: 'equals', value: 'active' } }],
        };
        mockLean.mockResolvedValue(branchChain);

        await langchainStreamService.streamChainExecution('branch_chain_123', { status: 'active' }, userId, emit);

        const doneCall = emit.mock.calls.find(call => call[0].event === 'done');
        expect(doneCall[0].finalOutputs.check_condition).toEqual({ match: true });
        expect(doneCall[0].success).toBe(true);
      });

      it('should execute a "parser" step with regex fallback', async () => {
        const parserChain = {
          _id: 'parser_chain_123',
          name: 'Parser Test Chain',
          steps: [{ name: 'parse_text', type: 'parser', config: { sourceVariable: 'raw_text', expectedFields: ['name', 'age'] } }],
        };
        mockLean.mockResolvedValue(parserChain);
        const malformedJson = 'This is not json, but it has "name": "John" and "age": "30"';

        await langchainStreamService.streamChainExecution('parser_chain_123', { raw_text: malformedJson }, userId, emit);

        const doneCall = emit.mock.calls.find(call => call[0].event === 'done');
        expect(doneCall[0].finalOutputs.parse_text).toEqual({ name: 'John', age: '30' });
        expect(doneCall[0].success).toBe(true);
      });

      it('should execute a "tool" step correctly', async () => {
        const toolChain = {
          _id: 'tool_chain_123',
          name: 'Tool Test Chain',
          steps: [{ name: 'run_tool', type: 'tool', config: { toolName: 'send_email', params: { to: '{email_address}' } } }],
        };
        mockLean.mockResolvedValue(toolChain);

        await langchainStreamService.streamChainExecution('tool_chain_123', { email_address: 'test@example.com' }, userId, emit);

        const doneCall = emit.mock.calls.find(call => call[0].event === 'done');
        expect(doneCall[0].finalOutputs.run_tool).toMatchObject({
          executed: true,
          tool: 'send_email',
          result: 'Mock successful trigger of tool: send_email',
        });
        expect(doneCall[0].success).toBe(true);
      });

      it('should throw an error for an unsupported step type', async () => {
        const invalidChain = {
          _id: 'invalid_chain_123',
          name: 'Invalid Chain',
          steps: [{ name: 'bad_step', type: 'unknown_type', config: {} }],
        };
        mockLean.mockResolvedValue(invalidChain);

        await langchainStreamService.streamChainExecution('invalid_chain_123', {}, userId, emit);

        expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'step_error', error: 'Unsupported chain step type: unknown_type' }));
        expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'done', success: false }));
      });
    });
  });
});