import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { MongoDBSaver } from './MongoDBSaver.js';
import {
  detectIntentNode,
  routeOnIntent,
  generateCodeNode,
  explainCodeNode,
  debugCodeNode,
  bestPracticesNode,
  generalConversationNode,
} from './nodes.js';
import { codeAssistantState } from './state.js';
import config from '../../../../../config/index.js';

// --- Mocks ---

const mockWorkflowInstance = {
  addNode: vi.fn(),
  addEdge: vi.fn(),
  addConditionalEdges: vi.fn(),
  compile: vi.fn((config) => ({
    ...config,
    compiled: true,
    checkpointerType: config.checkpointer?.constructor.name || 'unknown'
  })),
};

vi.mock('@langchain/langgraph', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    StateGraph: vi.fn().mockImplementation(() => mockWorkflowInstance),
    MemorySaver: vi.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
    START: 'START',
    END: 'END',
  };
});

vi.mock('./state.js', () => ({
  codeAssistantState: { channels: 'mockChannels' },
}));

vi.mock('./nodes.js', () => ({
  detectIntentNode: vi.fn(() => 'detectIntentNode'),
  routeOnIntent: vi.fn(() => 'routeOnIntent'),
  generateCodeNode: vi.fn(() => 'generateCodeNode'),
  explainCodeNode: vi.fn(() => 'explainCodeNode'),
  debugCodeNode: vi.fn(() => 'debugCodeNode'),
  bestPracticesNode: vi.fn(() => 'bestPracticesNode'),
  generalConversationNode: vi.fn(() => 'generalConversationNode'),
}));

const mockMongoCheckpointer = { type: 'MongoDBSaver' };
const fromUriMock = vi.fn();
vi.mock('./MongoDBSaver.js', () => ({
  MongoDBSaver: {
    fromUri: fromUriMock,
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    database_uri: 'mock-mongodb-uri',
  },
}));

// --- Tests ---

describe('Code Assistant Workflow', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Import the module to trigger its execution and mock population
  let workflowModule;
  beforeAll(async () => {
    fromUriMock.mockResolvedValue(mockMongoCheckpointer); // Default to success
    workflowModule = await import('./workflow.js');
  });

  describe('validateContextAndPermissionsNode', () => {
    let validateNode;

    beforeAll(() => {
      // Extract the node function from the mock calls
      const nodeCall = mockWorkflowInstance.addNode.mock.calls.find(
        (call) => call[0] === 'validate_context'
      );
      if (nodeCall) {
        validateNode = nodeCall[1];
      }
    });

    it('should be defined and added to the workflow', () => {
      expect(validateNode).toBeDefined();
      expect(typeof validateNode).toBe('function');
    });

    it('should succeed for an admin user with valid context', async () => {
      const config = { configurable: { userId: 'user-admin-1', workspaceId: 'ws-1' } };
      const state = {};
      const result = await validateNode(state, config);

      expect(result).toEqual({
        user: { id: 'user-admin-1', role: 'admin' },
        workspace: { id: 'ws-1', ownerId: 'user-admin-1' },
      });
    });

    it('should succeed for a member user with valid context', async () => {
      const config = { configurable: { userId: 'user-member-1', workspaceId: 'ws-1' } };
      const state = {};
      const result = await validateNode(state, config);

      expect(result).toEqual({
        user: { id: 'user-member-1', role: 'member' },
        workspace: { id: 'ws-1', ownerId: 'user-admin-1' },
      });
    });

    it('should throw an error if userId is missing', async () => {
      const config = { configurable: { workspaceId: 'ws-1' } };
      const state = {};
      await expect(validateNode(state, config)).rejects.toThrow(
        'Authorization Error: User ID and Workspace ID are required.'
      );
    });

    it('should throw an error if workspaceId is missing', async () => {
      const config = { configurable: { userId: 'user-admin-1' } };
      const state = {};
      await expect(validateNode(state, config)).rejects.toThrow(
        'Authorization Error: User ID and Workspace ID are required.'
      );
    });

    it('should throw an error for a non-existent user', async () => {
      const config = { configurable: { userId: 'non-existent-user', workspaceId: 'ws-1' } };
      const state = {};
      await expect(validateNode(state, config)).rejects.toThrow(
        'Authorization Error: User is not authorized for this workspace.'
      );
    });

    it('should throw an error for a non-existent workspace', async () => {
      const config = { configurable: { userId: 'user-admin-1', workspaceId: 'non-existent-ws' } };
      const state = {};
      await expect(validateNode(state, config)).rejects.toThrow(
        'Authorization Error: User is not authorized for this workspace.'
      );
    });

    it('should throw an error for a user with an unauthorized role (RBAC)', async () => {
      const config = { configurable: { userId: 'user-viewer-1', workspaceId: 'ws-1' } };
      const state = {};
      await expect(validateNode(state, config)).rejects.toThrow(
        "Access Denied: Your role ('viewer') does not have permission to use the Code Assistant."
      );
    });
  });

  describe('Workflow Graph Construction', () => {
    it('should initialize StateGraph with the correct state channels', () => {
      expect(StateGraph).toHaveBeenCalledWith({ channels: codeAssistantState });
    });

    it('should add all required nodes to the graph', () => {
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('validate_context', expect.any(Function));
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('detect_intent', detectIntentNode);
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('generate_code', generateCodeNode);
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('explain_code', explainCodeNode);
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('debug_code', debugCodeNode);
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('best_practices', bestPracticesNode);
      expect(mockWorkflowInstance.addNode).toHaveBeenCalledWith('general_conversation', generalConversationNode);
    });

    it('should define the correct workflow edges', () => {
      // Entry point
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith(START, 'validate_context');
      // Validation to intent detection
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('validate_context', 'detect_intent');
      // End points
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('generate_code', END);
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('explain_code', END);
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('debug_code', END);
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('best_practices', END);
      expect(mockWorkflowInstance.addEdge).toHaveBeenCalledWith('general_conversation', END);
    });

    it('should define the conditional edges from intent detection', () => {
      expect(mockWorkflowInstance.addConditionalEdges).toHaveBeenCalledWith(
        'detect_intent',
        routeOnIntent,
        {
          generate_code: 'generate_code',
          explain_code: 'explain_code',
          debug_code: 'debug_code',
          best_practices: 'best_practices',
          general_conversation: 'general_conversation',
        }
      );
    });
  });

  describe('Checkpointer Initialization', () => {
    it('should initially compile the app with a MemorySaver', () => {
      // This check is based on the first compilation that happens during module import
      expect(mockWorkflowInstance.compile).toHaveBeenCalledTimes(1);
      const firstCompileCall = mockWorkflowInstance.compile.mock.results[0].value;
      expect(firstCompileCall.checkpointerType).toBe('MemorySaver');
    });

    describe('Async MongoDB Checkpointer Upgrade', () => {
      beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules(); // This is key to re-running the module-level code
      });

      it('should re-compile the app with MongoDBSaver on successful connection', async () => {
        fromUriMock.mockResolvedValue(mockMongoCheckpointer);

        const module = await import('./workflow.js');
        await new Promise(process.nextTick); // Wait for the promise in the module to resolve

        expect(MongoDBSaver.fromUri).toHaveBeenCalledWith(config.database_uri, expect.any(Object));
        expect(mockWorkflowInstance.compile).toHaveBeenCalledTimes(2); // Initial + Re-compile
        
        const lastCompileCall = mockWorkflowInstance.compile.mock.calls.slice(-1)[0][0];
        expect(lastCompileCall.checkpointer).toBe(mockMongoCheckpointer);
        
        expect(module.codeAssistantApp.checkpointer).toBe(mockMongoCheckpointer);
        expect(logSpy).toHaveBeenCalledWith('✅ Code assistant: MongoDB checkpointer connected');
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('should log a warning and use in-memory fallback on failed connection', async () => {
        const connectionError = new Error('DB connection failed');
        fromUriMock.mockRejectedValue(connectionError);

        const module = await import('./workflow.js');
        await new Promise(process.nextTick); // Wait for the promise in the module to reject

        expect(MongoDBSaver.fromUri).toHaveBeenCalledWith(config.database_uri, expect.any(Object));
        expect(mockWorkflowInstance.compile).toHaveBeenCalledTimes(1); // Only the initial compile
        
        const firstCompileCall = mockWorkflowInstance.compile.mock.results[0].value;
        expect(firstCompileCall.checkpointerType).toBe('MemorySaver');

        expect(module.codeAssistantApp.checkpointerType).toBe('MemorySaver');
        expect(warnSpy).toHaveBeenCalledWith(
          '⚠️ Code assistant: MongoDB checkpointer unavailable, using in-memory fallback:',
          connectionError.message
        );
        expect(logSpy).not.toHaveBeenCalled();
      });
    });
  });
});