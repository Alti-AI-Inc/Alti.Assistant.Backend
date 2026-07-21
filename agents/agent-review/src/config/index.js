import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,
  agentName: 'review',
  agentVersion: '1.0.0',
  primaryModel: 'gemini-3.1-pro',
  fallbackModel: 'gemini-3.5-flash',
  vertexAiRegion: 'us-east5',
  defaults: {
    temperature: 0.08,
    maxOutputTokens: 8192,
  },
  reviewTypes: [
    'code',
    'document',
    'architecture',
    'security',
    'performance',
    'api',
    'product',
    'general',
  ],
};

export default agentConfig;
