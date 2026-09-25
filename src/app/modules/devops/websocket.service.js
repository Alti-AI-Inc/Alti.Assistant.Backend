import { logger } from '../../../shared/logger.js';
import { WebSocketServer } from 'ws';

let wss;

export const WebSocketService = {
  initialize(server) {
    logger.info(`[WebSocket Service] Initializing WSS on backend port...`);
    wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      logger.info(`[WebSocket Service] New client connection established.`);
      ws.on('error', console.error);
    });
  },

  broadcastNotification(event, payload) {
    if (!wss) return;
    logger.info(`[WebSocket Service] Broadcasting backend event: ${event}`);
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify({ event, data: payload }));
      }
    });
  }
};
