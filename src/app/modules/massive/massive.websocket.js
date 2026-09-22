import WebSocket from 'ws';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

class MassiveWebSocketEngine {
  constructor() {
    this.apiKey = config.massive?.apiKey || process.env.MASSIVE_API_KEY || 'demo-massive-key';
    this.baseUrl = 'wss://ws.massive.com/v1';
    
    // Maintain active connections per asset class
    this.connections = {
      stocks: null,
      options: null,
      futures: null,
      indices: null,
      forex: null,
      crypto: null,
    };
    
    // In-memory latest price cache for AGI to query synchronously
    this.latestData = {
      stocks: {},
      options: {},
      futures: {},
      indices: {},
      forex: {},
      crypto: {}
    };

    this.reconnectTimeouts = {};
  }

  /**
   * Connect to a specific Massive websocket stream (stocks, crypto, etc)
   */
  connect(assetClass) {
    if (!Object.keys(this.connections).includes(assetClass)) {
      throw new Error(`Unsupported asset class: ${assetClass}`);
    }

    const wsUrl = `${this.baseUrl}/${assetClass}?apikey=${this.apiKey}`;
    logger.info(`[Massive WS] Connecting to ${assetClass} stream...`);
    
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info(`[Massive WS] Connected to ${assetClass} successfully.`);
      // Clear any reconnect timeouts
      if (this.reconnectTimeouts[assetClass]) {
        clearTimeout(this.reconnectTimeouts[assetClass]);
        this.reconnectTimeouts[assetClass] = null;
      }
      
      // Send a generic subscription if required by massive docs
      ws.send(JSON.stringify({ action: 'subscribe', params: { channel: 'all' } }));
    });

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data);
        // Process heartbeat or array of trades/quotes
        if (Array.isArray(payload)) {
          payload.forEach(msg => this.processMessage(assetClass, msg));
        } else {
          this.processMessage(assetClass, payload);
        }
      } catch (err) {
        logger.error(`[Massive WS] Parse error on ${assetClass}: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[Massive WS] Error on ${assetClass}: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      logger.warn(`[Massive WS] Connection closed for ${assetClass} (Code: ${code}). Reconnecting in 5s...`);
      this.connections[assetClass] = null;
      this.reconnectTimeouts[assetClass] = setTimeout(() => this.connect(assetClass), 5000);
    });

    this.connections[assetClass] = ws;
  }

  processMessage(assetClass, msg) {
    // Massive generic schema parsing
    if (msg.type === 'trade' || msg.type === 'quote') {
      const ticker = msg.symbol || msg.ticker;
      if (ticker) {
        this.latestData[assetClass][ticker] = {
          price: msg.price,
          volume: msg.volume,
          timestamp: msg.timestamp || Date.now(),
          type: msg.type
        };
      }
    }
  }

  /**
   * Initialize all streams
   */
  initializeAll() {
    ['stocks', 'options', 'futures', 'indices', 'forex', 'crypto'].forEach(asset => {
      this.connect(asset);
    });
  }

  /**
   * Subscribe to specific tickers dynamically
   */
  subscribe(assetClass, tickers) {
    const ws = this.connections[assetClass];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: Array.isArray(tickers) ? tickers : [tickers]
      }));
    } else {
      logger.warn(`[Massive WS] Cannot subscribe. ${assetClass} stream is not open.`);
    }
  }

  /**
   * Get latest tick data synchronously for AGI inference
   */
  getLatestData(assetClass, ticker) {
    if (assetClass && ticker) {
      return this.latestData[assetClass]?.[ticker] || null;
    }
    return this.latestData;
  }
}

export const MassiveWebSocket = new MassiveWebSocketEngine();
