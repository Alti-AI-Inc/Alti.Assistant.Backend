import { Composio } from 'composio-core';
import config from '../../../../config/index.js';

const composioClient = new Composio({
  apiKey: config.composio.apiKey,
});

export { composioClient };
export default composioClient;
