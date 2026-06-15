import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockChatGoogleGenerativeAI,
  mockConfig
} = vi.hoisted(() => {
  // Mock the dependencies before any imports
  const mockChatGoogleGenerativeAI = vi.fn();

  const mockConfig = {
    gemini_secret_key: 'test-gemini-key',
    google: {
      gcp_project_id: 'test-gcp-project',
      vertex_ai_region: 'test-region',
    },
  };

  return {
    mockChatGoogleGenerativeAI,
    mockConfig
  };
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

describe('app/modules/video/llm.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // This is crucial to ensure the module is re-evaluated with fresh mocks for each test
    vi.resetModules();
  });

  it('should instantiate ChatGoogleGenerativeAI with the correct configuration from the config file', async () => {
    // Arrange: The mock config is already set up with a specific region.

    // Act: Dynamically import the module to trigger its top-level execution after mocks are in place.
    await import('./llm.js');

    // Assert: Check that the constructor was called once with the expected parameters.
    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: mockConfig.gemini_secret_key,
      model: 'gemini-3.5-flash',
      project: mockConfig.google.gcp_project_id,
      location: mockConfig.google.vertex_ai_region,
      temperature: 0.7,
    });
  });

  it('should use the default location "us-central1" when vertex_ai_region is not provided in config', async () => {
    // Arrange: Override the mock config for this specific test case to omit the region.
    vi.mock('../../../../config/index.js', () => ({
      default: {
        gemini_secret_key: 'test-gemini-key-2',
        google: {
          gcp_project_id: 'test-gcp-project-2',
          // vertex_ai_region is intentionally omitted
        },
      },
    }));

    // Act: Dynamically import the module to trigger its execution with the new mock.
    await import('./llm.js');

    // Assert: Check that the constructor was called with the fallback location.
    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: 'test-gemini-key-2',
      model: 'gemini-3.5-flash',
      project: 'test-gcp-project-2',
      location: 'us-central1', // The fallback value
      temperature: 0.7,
    });
  });

  it('should export a single instance named "llm"', async () => {
    // Arrange: Set up a mock instance to be returned by the constructor
    const mockInstance = { id: 'mock-llm-instance' };
    mockChatGoogleGenerativeAI.mockReturnValue(mockInstance);

    // Act: Import the module
    const llmModule = await import('./llm.js');

    // Assert: Check that the exported 'llm' variable is the instance created by the mock constructor.
    expect(llmModule.llm).toBeDefined();
    expect(llmModule.llm).toBe(mockInstance);
    expect(Object.keys(llmModule)).toEqual(['llm']);
  });

  it('should not contain any role-based access control logic', async () => {
    // This test serves as documentation that this module is for configuration/instantiation
    // and is not involved in application-level concerns like authorization.
    const llmModule = await import('./llm.js');
    const moduleContent = await import('fs').then(fs => fs.readFileSync('./llm.js', 'utf-8'));

    expect(llmModule.llm).toBeDefined();
    expect(moduleContent).not.toMatch(/super_admin|admin|manager|user|role/i);
  });
});