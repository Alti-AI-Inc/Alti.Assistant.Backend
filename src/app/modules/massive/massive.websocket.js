import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

/**
 * MassiveWebSocketEngine — Real-time market data streaming from Massive.com
 *
 * Massive WS Protocol (from docs):
 * - Real-time:  wss://socket.massive.com/{stocks|options|futures|indices|forex|crypto}
 * - Delayed:    wss://delayed.massive.com/{stocks|options|futures|indices|forex|crypto}
 * - Auth:       {"action":"auth","params":"YOUR_API_KEY"}
 * - Subscribe:  {"action":"subscribe","params":"T.AAPL,Q.AAPL"}
 * - Unsubscribe:{"action":"unsubscribe","params":"T.AAPL"}
 *
 * WebSocket Feed Channels (28 total):
 *   Stocks:  trades(T), quotes(Q), aggs/min(AM), aggs/sec(A), fair-market-value(FMV), luld(LULD), imbalances(NOI)
 *   Options: trades(T), quotes(Q), aggs/min(AM), aggs/sec(A), fair-market-value(FMV)
 *   Futures: trades(T), quotes(Q), aggs/min(AM), aggs/sec(A)
 *   Indices: value(V), aggs/min(AM), aggs/sec(A)
 *   Forex:   quotes(C), aggs/min(CA), aggs/sec(CAS), fair-market-value(FMV)
 *   Crypto:  trades(XT), quotes(XQ), aggs/min(XA), aggs/sec(XAS), fair-market-value(FMV)
 */

const ASSET_CLASSES = ['stocks', 'options', 'futures', 'indices', 'forex', 'crypto'];

class MassiveWebSocketEngine extends EventEmitter {
  constructor() {
    super();
    this.apiKey = config.massive?.apiKey || process.env.MASSIVE_API_KEY || '';
    this.realTimeBase = 'wss://socket.massive.com';
    this.delayedBase = 'wss://delayed.massive.com';

    // Active connections per asset class
    this.connections = {};
    // In-memory latest tick cache for AGI instant access
    this.latestData = {};
    // Reconnect state
    this.reconnectTimeouts = {};
    // Subscription registry
    this.subscriptions = {};

    for (const ac of ASSET_CLASSES) {
      this.connections[ac] = null;
      this.latestData[ac] = {};
      this.subscriptions[ac] = new Set();
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────

  connect(assetClass, { realtime = true } = {}) {
    if (!ASSET_CLASSES.includes(assetClass)) {
      throw new Error(`Unsupported asset class: ${assetClass}. Must be one of: ${ASSET_CLASSES.join(', ')}`);
    }

    const base = realtime ? this.realTimeBase : this.delayedBase;
    const wsUrl = `${base}/${assetClass}`;
    logger.info(`[Massive WS] Connecting to ${wsUrl}...`);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info(`[Massive WS] Connected to ${assetClass}. Authenticating...`);
      // Step 1: Authenticate per Massive docs
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
      // Clear reconnect
      if (this.reconnectTimeouts[assetClass]) {
        clearTimeout(this.reconnectTimeouts[assetClass]);
        this.reconnectTimeouts[assetClass] = null;
      }
    });

    ws.on('message', (raw) => {
      try {
        const messages = JSON.parse(raw);
        if (!Array.isArray(messages)) return;

        for (const msg of messages) {
          // Handle status events (connected, auth_success, auth_failed)
          if (msg.ev === 'status') {
            if (msg.status === 'auth_success') {
              logger.info(`[Massive WS] Authenticated on ${assetClass}`);
              // Re-subscribe to any previously registered tickers
              if (this.subscriptions[assetClass].size > 0) {
                const params = [...this.subscriptions[assetClass]].join(',');
                ws.send(JSON.stringify({ action: 'subscribe', params }));
              }
            } else if (msg.status === 'auth_failed') {
              logger.error(`[Massive WS] Auth FAILED on ${assetClass}: ${msg.message}`);
            }
            continue;
          }

          // Cache latest data keyed by event type + symbol
          const ticker = msg.sym || msg.T || msg.pair || msg.ticker || 'unknown';
          if (!this.latestData[assetClass][ticker]) {
            this.latestData[assetClass][ticker] = {};
          }
          this.latestData[assetClass][ticker][msg.ev] = {
            ...msg,
            _receivedAt: Date.now()
          };

          // Emit for real-time listeners
          this.emit('tick', { assetClass, ticker, event: msg.ev, data: msg });
        }
      } catch (err) {
        logger.error(`[Massive WS] Parse error on ${assetClass}: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[Massive WS] Error on ${assetClass}: ${err.message}`);
    });

    ws.on('close', (code) => {
      logger.warn(`[Massive WS] ${assetClass} closed (${code}). Reconnecting in 5s...`);
      this.connections[assetClass] = null;
      this.reconnectTimeouts[assetClass] = setTimeout(() => this.connect(assetClass, { realtime }), 5000);
    });

    this.connections[assetClass] = ws;
  }

  // ── Subscribe / Unsubscribe ─────────────────────────────────────────────

  /**
   * Subscribe to specific ticker feeds.
   * Prefix format per Massive docs:
   *   Stocks:  T.AAPL (trades), Q.AAPL (quotes), AM.AAPL (min aggs), A.AAPL (sec aggs)
   *   Options: T.O:AAPL251219C00300000, Q.O:...
   *   Futures: T./ESZ5, Q./ESZ5
   *   Indices: V.I:SPX, AM.I:SPX
   *   Forex:   C.C:EURUSD, CA.C:EURUSD
   *   Crypto:  XT.X:BTCUSD, XQ.X:BTCUSD
   */
  subscribe(assetClass, params) {
    const ws = this.connections[assetClass];
    const paramStr = Array.isArray(params) ? params.join(',') : params;
    
    // Track subscriptions for reconnect
    paramStr.split(',').forEach(p => this.subscriptions[assetClass].add(p.trim()));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'subscribe', params: paramStr }));
      logger.info(`[Massive WS] Subscribed on ${assetClass}: ${paramStr}`);
    } else {
      logger.warn(`[Massive WS] ${assetClass} not connected. Subscription queued for reconnect.`);
    }
  }

  unsubscribe(assetClass, params) {
    const ws = this.connections[assetClass];
    const paramStr = Array.isArray(params) ? params.join(',') : params;
    paramStr.split(',').forEach(p => this.subscriptions[assetClass].delete(p.trim()));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'unsubscribe', params: paramStr }));
    }
  }

  // ── Data Access ─────────────────────────────────────────────────────────

  getLatestTick(assetClass, ticker) {
    return this.latestData[assetClass]?.[ticker] || null;
  }

  getAllLatestData(assetClass) {
    return this.latestData[assetClass] || {};
  }

  getConnectionStatus() {
    const status = {};
    for (const ac of ASSET_CLASSES) {
      const ws = this.connections[ac];
      status[ac] = ws ? (ws.readyState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING') : 'CLOSED';
    }
    return status;
  }

  // ── Boot All ────────────────────────────────────────────────────────────

  initializeAll({ realtime = true } = {}) {
    if (!this.apiKey) {
      logger.warn('[Massive WS] No MASSIVE_API_KEY set. Skipping WebSocket initialization.');
      return;
    }
    for (const ac of ASSET_CLASSES) {
      this.connect(ac, { realtime });
    }
  }

  // ── Shutdown ────────────────────────────────────────────────────────────

  closeAll() {
    for (const ac of ASSET_CLASSES) {
      if (this.reconnectTimeouts[ac]) clearTimeout(this.reconnectTimeouts[ac]);
      if (this.connections[ac]) this.connections[ac].close();
    }
  }
}

export const MassiveWebSocket = new MassiveWebSocketEngine();
