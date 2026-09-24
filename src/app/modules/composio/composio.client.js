import { Composio } from 'composio-core';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// ── Composio Client with graceful degradation ─────────────────────────────
// If COMPOSIO_API_KEY is missing or placeholder, exports a null client.
// All service methods should check `if (!composioClient)` before calling SDK.

const COMPOSIO_KEY = config.composio?.apiKey;
const isRealKey = COMPOSIO_KEY && !COMPOSIO_KEY.includes('placeholder') && !COMPOSIO_KEY.includes('your_') && COMPOSIO_KEY.length > 10;

let composioClient = null;

if (isRealKey) {
  try {
    composioClient = new Composio({ apiKey: COMPOSIO_KEY });
    logger.info('[Composio] Client initialized with real API key.');
  } catch (err) {
    logger.error(`[Composio] SDK init failed: ${err.message}`);
  }
} else {
  logger.warn('[Composio] COMPOSIO_API_KEY missing or placeholder — Composio tools disabled. Set a real key in .env to enable.');
}

export { composioClient };
export default composioClient;
