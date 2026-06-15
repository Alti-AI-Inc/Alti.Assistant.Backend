import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  mockConnect,
  mockDisconnect,
  mockAggregate,
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockConnect = vi.fn();
  const mockDisconnect = vi.fn();

  const mockAggregate = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    embedContent: (...args) => mockEmbedContent(...args),
  });

  return {
    mockConnect,
    mockDisconnect,
    mockAggregate,
    mockGetGenerativeModel
  };
});

vi.mock('mongoose', () => ({
  default: {
    connect: (...args) => mockConnect(...args),
    disconnect: (...args) => mockDisconnect(...args),
  },
}));

vi.mock('../composio_v2/tools.model.js', () => ({
  default: {
    aggregate: (...args) => mockAggregate(...args),
  },
}));

const mockEmbedContent = vi.fn();
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    }),
  };
});

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-api-key',
    database_url: 'mongodb://localhost:27017/test',
  },
}));

describe('test-vector-search.js', () => {
  let originalExit;
  let originalLog;
  let originalError;
  let mockExit;

  beforeEach(() => {
    originalExit = process.exit;
    originalLog = console.log;
    originalError = console.error;

    mockExit = vi.fn();
    vi.stubGlobal('process', { ...process, exit: mockExit });
    console.log = vi.fn();
    console.error = vi.fn();

    mockConnect.mockReset();
    mockDisconnect.mockReset();
    mockAggregate.mockReset();
    mockEmbedContent.mockReset();
    mockGetGenerativeModel.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
  });

  it('should run all queries successfully when no errors occur', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockEmbedContent.mockResolvedValue({
      embedding: {
        values: Array(1536).fill(0.1),
      },
    });
    mockAggregate.mockResolvedValue([
      {
        name: 'Test Tool',
        appName: null,
        score: null,
        description: null,
      },
    ]);

    await import(`./test-vector-search.js?t=${Date.now()}`);

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (mockDisconnect.mock.calls.length > 0 || mockExit.mock.calls.length > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/test');
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'text-embedding-004' });
    expect(mockEmbedContent).toHaveBeenCalledTimes(4);
    expect(mockAggregate).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should handle vector search failures inside the loop and continue', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockEmbedContent.mockResolvedValue({
      embedding: {
        values: Array(1536).fill(0.1),
      },
    });
    
    let callCount = 0;
    mockAggregate.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error('Mock search failure'));
      }
      return Promise.resolve([
        {
          name: 'Test Tool',
          appName: 'github',
          score: 0.88,
          description: 'GitHub tool description',
        },
      ]);
    });

    await import(`./test-vector-search.js?t=${Date.now()}`);

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (mockDisconnect.mock.calls.length > 0 || mockExit.mock.calls.length > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockEmbedContent).toHaveBeenCalledTimes(4);
    expect(mockAggregate).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should exit with 1 if database connection fails', async () => {
    mockConnect.mockRejectedValue(new Error('Connection failed'));
    mockDisconnect.mockResolvedValue(undefined);

    await import(`./test-vector-search.js?t=${Date.now()}`);

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (mockExit.mock.calls.length > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit with 1 if embedding generation fails', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockEmbedContent.mockRejectedValue(new Error('Embedding failed'));

    await import(`./test-vector-search.js?t=${Date.now()}`);

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (mockExit.mock.calls.length > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockEmbedContent).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});