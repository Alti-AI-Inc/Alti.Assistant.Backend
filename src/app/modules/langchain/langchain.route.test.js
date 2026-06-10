import { describe, it, expect, vi } from 'vitest';

const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

vi.mock('./langchain.controller.js', () => ({
  LangchainController: {
    getRepositories: () => {},
    getStats: () => {},
    importSubmodule: () => {},
    createChain: () => {},
    listChains: () => {},
    runChain: () => {},
    getExecutions: () => {},
    optimizeChain: () => {},
    rollbackChain: () => {},
    getChainVersions: () => {},
    benchmarkChain: () => {},
    streamChain: () => {},
  },
}));

const { langchainRoutes } = await import('./langchain.route.js');
const { LangchainController } = await import('./langchain.controller.js');

describe('Langchain Routes', () => {
  it('should register the correct GET routes', () => {
    expect(mockRouter.get).toHaveBeenCalledWith('/repositories', LangchainController.getRepositories);
    expect(mockRouter.get).toHaveBeenCalledWith('/stats', LangchainController.getStats);
    expect(mockRouter.get).toHaveBeenCalledWith('/chains', LangchainController.listChains);
    expect(mockRouter.get).toHaveBeenCalledWith('/chains/:chainId/executions', LangchainController.getExecutions);
    expect(mockRouter.get).toHaveBeenCalledWith('/chains/:chainId/optimize', LangchainController.optimizeChain);
    expect(mockRouter.get).toHaveBeenCalledWith('/chains/:chainId/versions', LangchainController.getChainVersions);
  });

  it('should register the correct POST routes', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/import', LangchainController.importSubmodule);
    expect(mockRouter.post).toHaveBeenCalledWith('/chains', LangchainController.createChain);
    expect(mockRouter.post).toHaveBeenCalledWith('/chains/:chainId/run', LangchainController.runChain);
    expect(mockRouter.post).toHaveBeenCalledWith('/chains/:chainId/rollback', LangchainController.rollbackChain);
    expect(mockRouter.post).toHaveBeenCalledWith('/chains/:chainId/benchmark', LangchainController.benchmarkChain);
    expect(mockRouter.post).toHaveBeenCalledWith('/chains/:chainId/stream', LangchainController.streamChain);
  });

  it('should export the router instance', () => {
    expect(langchainRoutes).toBe(mockRouter);
  });
});