import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  // Mock external dependencies
  // Mock config
  const mockConfig = {
    langchain: {
      tracingActive: 'false', // Default to false for easier testing of process.env override
      apiKey: undefined,
      project: undefined,
    },
  };

  // Mock logger
  const mockLogger = {
    info: vi.fn(),
  };

  return {
    mockConfig,
    mockLogger
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Mock LangChainTracer
const MockLangChainTracer = vi.fn();
vi.mock('@langchain/core/tracers/tracer_langchain', () => ({
  LangChainTracer: MockLangChainTracer,
}));

// Helper to import the module dynamically and clear cache
// This is crucial for testing the constructor's behavior with different env/config
const importLangsmithMiddlewareModule = async () => {
  vi.resetModules(); // Clear module cache to ensure a fresh import

  // Re-mock dependencies before re-importing
  vi.mock('../../../../../config/index.js', () => ({
    default: mockConfig,
  }));
  vi.mock('../../../../shared/logger.js', () => ({
    logger: mockLogger,
  }));
  vi.mock('@langchain/core/tracers/tracer_langchain', () => ({
    LangChainTracer: MockLangChainTracer,
  }));

  // Import the module under test
  const { langsmithMiddleware } = await import('./langsmithMiddleware.js');
  return langsmithMiddleware;
};

describe('LangsmithMiddleware', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv }; // Clone process.env to avoid side effects on other tests
    // Reset mocks
    mockLogger.info.mockClear();
    MockLangChainTracer.mockClear();
    // Reset mockConfig for each test
    mockConfig.langchain = {
      tracingActive: 'false',
      apiKey: undefined,
      project: undefined,
    };
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original process.env
  });

  describe('constructor initialization', () => {
    it('should initialize with default values if no env or config are set', async () => {
      delete process.env.LANGCHAIN_TRACING_V2;
      delete process.env.LANGCHAIN_API_KEY;
      delete process.env.LANGCHAIN_PROJECT;
      delete process.env.LANGCHAIN_ENDPOINT;
      mockConfig.langchain = {}; // Ensure config is empty

      const middleware = await importLangsmithMiddlewareModule();

      expect(middleware.tracingActive).toBe(false);
      expect(middleware.apiKey).toBeUndefined();
      expect(middleware.projectName).toBe('Alti Assistant-Assistant-RAG');
      expect(middleware.endpoint).toBe('https://api.smith.langchain.com');
    });

    it('should prioritize process.env over config for tracingActive', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      mockConfig.langchain.tracingActive = 'false';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.tracingActive).toBe(true);
    });

    it('should use config for tracingActive if process.env is not set', async () => {
      delete process.env.LANGCHAIN_TRACING_V2;
      mockConfig.langchain.tracingActive = 'true';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.tracingActive).toBe(true);
    });

    it('should prioritize process.env over config for apiKey', async () => {
      process.env.LANGCHAIN_API_KEY = 'env-key';
      mockConfig.langchain.apiKey = 'config-key';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.apiKey).toBe('env-key');
    });

    it('should use config for apiKey if process.env is not set', async () => {
      delete process.env.LANGCHAIN_API_KEY;
      mockConfig.langchain.apiKey = 'config-key';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.apiKey).toBe('config-key');
    });

    it('should prioritize process.env over config for projectName', async () => {
      process.env.LANGCHAIN_PROJECT = 'env-project';
      mockConfig.langchain.project = 'config-project';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.projectName).toBe('env-project');
    });

    it('should use config for projectName if process.env is not set', async () => {
      delete process.env.LANGCHAIN_PROJECT;
      mockConfig.langchain.project = 'config-project';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.projectName).toBe('config-project');
    });

    it('should use default projectName if neither env nor config are set', async () => {
      delete process.env.LANGCHAIN_PROJECT;
      mockConfig.langchain.project = undefined;

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.projectName).toBe('Alti Assistant-Assistant-RAG');
    });

    it('should prioritize process.env over default for endpoint', async () => {
      process.env.LANGCHAIN_ENDPOINT = 'http://env-endpoint.com';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.endpoint).toBe('http://env-endpoint.com');
    });

    it('should use default endpoint if process.env is not set', async () => {
      delete process.env.LANGCHAIN_ENDPOINT;

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.endpoint).toBe('https://api.smith.langchain.com');
    });
  });

  describe('getTracingEnv', () => {
    it('should return an empty object if tracing is inactive', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'false';
      process.env.LANGCHAIN_API_KEY = 'some-key';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.getTracingEnv()).toEqual({});
    });

    it('should return an empty object if API key is missing', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      delete process.env.LANGCHAIN_API_KEY;

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.getTracingEnv()).toEqual({});
    });

    it('should return correct env object when tracing is active and key is present', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = 'test-api-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';
      process.env.LANGCHAIN_ENDPOINT = 'http://test-endpoint.com';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.getTracingEnv()).toEqual({
        LANGCHAIN_TRACING_V2: 'true',
        LANGCHAIN_API_KEY: 'test-api-key',
        LANGCHAIN_PROJECT: 'test-project',
        LANGCHAIN_ENDPOINT: 'http://test-endpoint.com',
      });
    });
  });

  describe('logDiagnostics', () => {
    it('should log active message when tracing is active and API key is present', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = 'some-key';
      process.env.LANGCHAIN_PROJECT = 'MyProject';

      const middleware = await importLangsmithMiddlewareModule();
      // The first call happens on module import
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "MyProject"');

      // Call explicitly to test the method
      mockLogger.info.mockClear(); // Clear previous call for explicit test
      middleware.logDiagnostics();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "MyProject"');
    });

    it('should log inactive message when tracing is inactive', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'false';
      process.env.LANGCHAIN_API_KEY = 'some-key';

      const middleware = await importLangsmithMiddlewareModule();
      // The first call happens on module import
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');

      // Call explicitly to test the method
      mockLogger.info.mockClear(); // Clear previous call for explicit test
      middleware.logDiagnostics();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
    });

    it('should log inactive message when API key is missing', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      delete process.env.LANGCHAIN_API_KEY;

      const middleware = await importLangsmithMiddlewareModule();
      // The first call happens on module import
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');

      // Call explicitly to test the method
      mockLogger.info.mockClear(); // Clear previous call for explicit test
      middleware.logDiagnostics();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
    });
  });

  describe('getTraceCallbacks', () => {
    it('should return an empty array if tracing is inactive', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'false';
      process.env.LANGCHAIN_API_KEY = 'some-key';

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.getTraceCallbacks()).toEqual([]);
      expect(MockLangChainTracer).not.toHaveBeenCalled();
    });

    it('should return an empty array if API key is missing', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      delete process.env.LANGCHAIN_API_KEY;

      const middleware = await importLangsmithMiddlewareModule();
      expect(middleware.getTraceCallbacks()).toEqual([]);
      expect(MockLangChainTracer).not.toHaveBeenCalled();
    });

    it('should return an array with LangChainTracer when tracing is active and key is present', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = 'test-api-key';

      const middleware = await importLangsmithMiddlewareModule();
      const callbacks = middleware.getTraceCallbacks();
      expect(callbacks).toHaveLength(1);
      expect(MockLangChainTracer).toHaveBeenCalledTimes(1);
      expect(callbacks[0]).toBeInstanceOf(MockLangChainTracer);
    });

    it('should not use runName in LangChainTracer constructor', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = 'test-api-key';

      const middleware = await importLangsmithMiddlewareModule();
      middleware.getTraceCallbacks('CustomRunName');
      expect(MockLangChainTracer).toHaveBeenCalledWith(); // Should be called without arguments
    });
  });

  describe('exported singleton instance', () => {
    it('should call logDiagnostics on module import with active message', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = 'some-key';
      process.env.LANGCHAIN_PROJECT = 'InitialProject';

      // The act of importing the module should trigger logDiagnostics
      await importLangsmithMiddlewareModule();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Enterprise tracing active. Project Space: "InitialProject"');
    });

    it('should call logDiagnostics with inactive message on module import if tracing is off', async () => {
      process.env.LANGCHAIN_TRACING_V2 = 'false';
      process.env.LANGCHAIN_API_KEY = 'some-key';

      await importLangsmithMiddlewareModule();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('[LangSmith Trace Middleware] Tracing inactive. Tracing dashboard can be activated by providing LANGCHAIN_TRACING_V2 and LANGCHAIN_API_KEY.');
    });
  });
});