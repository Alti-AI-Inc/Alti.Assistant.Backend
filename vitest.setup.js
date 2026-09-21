import { vi } from 'vitest';

// Set dummy environment variables to prevent fatal process.exit() calls during module initialization in testing
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MONGODB_URI = 'mongodb://localhost:27017/inso_test';
process.env.CHAT_ENCRYPTION_KEY = 'test_encryption_key_32_bytes_long_string';

const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  isOpen: true,
  sendCommand: vi.fn().mockResolvedValue('OK'),
  call: vi.fn().mockResolvedValue('OK'),
  multi: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  mGet: vi.fn().mockResolvedValue([]),
  lPush: vi.fn().mockResolvedValue(1),
  lTrim: vi.fn().mockResolvedValue('OK'),
  lRange: vi.fn().mockResolvedValue([]),
  expire: vi.fn().mockResolvedValue(true),
  subscribe: vi.fn().mockResolvedValue(undefined),
};

vi.mock('redis', () => ({
  default: {
    createClient: vi.fn(() => mockRedisClient),
  },
  createClient: vi.fn(() => mockRedisClient),
}));

const mockPublishMessage = vi.fn().mockResolvedValue('msg-id-123');

vi.mock('./src/shared/queues.js', () => ({
  publishMessage: mockPublishMessage,
  subscribe: vi.fn().mockResolvedValue(undefined),
  scheduleTask: vi.fn().mockResolvedValue('task-id-123'),
  default: {
    publishMessage: mockPublishMessage,
    subscribe: vi.fn().mockResolvedValue(undefined),
    scheduleTask: vi.fn().mockResolvedValue('task-id-123'),
  }
}));

vi.mock('@langchain/langgraph', () => {
  const MockAnnotation = (config) => config;
  MockAnnotation.Root = () => ({});
  
  class MockStateGraph {
    constructor() { this.nodes = {}; }
    addNode() { return this; }
    addEdge() { return this; }
    addConditionalEdges() { return this; }
    compile() { 
      return {
        invoke: vi.fn().mockResolvedValue({ 
          report: 'Mocked research text',
          metadata: { nodesExecuted: 1 },
          content: 'Mocked writing text', // for write/code/etc
          finalDocument: 'Mocked writing text', // for write workflow
          enhancedPrompt: 'Mocked video prompt enhancement', // for video
          videoUrl: 'https://mock-video-url.com/video.mp4',
          imageUrl: 'data:image/png;base64,mock-base64-bytes',
          script: 'Mocked audio script',
          audioBase64: 'mock-audio-base64'
        })
      };
    }

  }
  
  return {
    Annotation: MockAnnotation,
    StateGraph: MockStateGraph,
    END: '__end__',
    START: '__start__'
  };
});

vi.mock('./shared/logging/index.js', () => {
  return {
    createLogger: () => ({
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
    })
  };
});

vi.mock('groq-sdk', () => {
  return {
    default: class {
      constructor() {
        this.chat = {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Mocked writing text' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            })
          }
        };
      }
    }
  };
});
