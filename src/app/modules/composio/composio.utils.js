import config from '../../../../config/index.js';

export const headers = {
  'x-api-key': config.composio.apiKey,
  'Content-Type': 'application/json',
};
