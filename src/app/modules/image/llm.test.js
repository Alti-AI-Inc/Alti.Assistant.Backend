import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockChatGoogleGenerativeAI,
  mockPredictionServiceClient
} = vi.hoisted(() => {
  // Mock external classes
  const mockChatGoogleGenerativeAI = vi.fn();
  const mockPredictionServiceClient = vi.fn();

  return {
    mockChatGoogleGenerativeAI,
    mockPredictionServiceClient
  };
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: mockPredictionServiceClient,
}));

describe('LLM Client Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache for the file under test to allow re-importing with new mocks
    vi.resetModules();
  });

  it('should initialize ChatGoogleGenerativeAI with correct configuration', async () => {
    const mockConfig = {
      gemini_secret_key: 'test-gemini-key',
      google: { gcp_location: 'us-central1' }, // Required for predictionServiceClient, but not for llm
    };
    vi.doMock('../../../../config/index.js', () => ({ default: mockConfig }));

    const { llm } = await import('./llm.js');

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: mockConfig.gemini_secret_key,
      model: 'gemini-2.5-flash',
      temperature: 0.7,
    });
    expect(llm).toBeInstanceOf(mockChatGoogleGenerativeAI);
  });

  it('should initialize PredictionServiceClient with correct API endpoint using config.google.gcp_location', async () => {
    const mockConfig = {
      gemini_secret_key: 'any-key', // Not relevant for this test
      google: { gcp_location: 'europe-west1' },
    };
    vi.doMock('../../../../config/index.js', () => ({ default: mockConfig }));

    const { predictionServiceClient } = await import('./llm.js');

    expect(mockPredictionServiceClient).toHaveBeenCalledTimes(1);
    expect(mockPredictionServiceClient).toHaveBeenCalledWith({
      apiEndpoint: `${mockConfig.google.gcp_location}-aiplatform.googleapis.com`,
    });
    expect(predictionServiceClient).toBeInstanceOf(mockPredictionServiceClient);
  });

  it('should initialize PredictionServiceClient with correct API endpoint using config.gcpLocation fallback', async () => {
    const mockConfig = {
      gemini_secret_key: 'any-key',
      google: {}, // No gcp_location
      gcpLocation: 'asia-east1', // Fallback
    };
    vi.doMock('../../../../config/index.js', () => ({ default: mockConfig }));

    const { predictionServiceClient } = await import('./llm.js');

    expect(mockPredictionServiceClient).toHaveBeenCalledTimes(1);
    expect(mockPredictionServiceClient).toHaveBeenCalledWith({
      apiEndpoint: `${mockConfig.gcpLocation}-aiplatform.googleapis.com`,
    });
    expect(predictionServiceClient).toBeInstanceOf(mockPredictionServiceClient);
  });

  it('should initialize PredictionServiceClient with default "us-central1" API endpoint if no specific location is provided', async () => {
    const mockConfig = {
      gemini_secret_key: 'any-key',
      google: {}, // No gcp_location
      // No gcpLocation fallback
    };
    vi.doMock('../../../../config/index.js', () => ({ default: mockConfig }));

    const { predictionServiceClient } = await import('./llm.js');

    expect(mockPredictionServiceClient).toHaveBeenCalledTimes(1);
    expect(mockPredictionServiceClient).toHaveBeenCalledWith({
      apiEndpoint: `us-central1-aiplatform.googleapis.com`,
    });
    expect(predictionServiceClient).toBeInstanceOf(mockPredictionServiceClient);
  });
});