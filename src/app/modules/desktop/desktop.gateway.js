import { WebSocketServer } from 'ws';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import jwt from 'jsonwebtoken';
import config from '../../../../config/index.js';

import crypto from 'crypto';

// The OEM Master Key derived from OpenStack Barbican HSM for the Desktop Gateway
const BARBICAN_AES_KEY = crypto.scryptSync(process.env.BARBICAN_SECRET || 'liberty-center-one-oem-key', 'salt', 32);

export const DesktopGateway = {
  wss: null,
  clients: new Map(),

  initialize(server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      if (request.url.startsWith('/api/v1/desktop/bridge')) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', async (ws, request) => {
      // Very basic auth via query param for the desktop app
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      
      let userId;
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        userId = decoded.userId || decoded._id;
      } catch (err) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      logger.info(`[Desktop Gateway] Desktop App connected for user: ${userId}`);
      this.clients.set(userId, ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          
          // If desktop app is sending screenshot frames or command outputs back to the engine
          if (message.type === 'computer_use_result') {
            await RedisClient.publish(`desktop_result_${userId}`, JSON.stringify(message.payload));
          }
        } catch (e) {
          logger.error(`[Desktop Gateway] Malformed message: ${e.message}`);
        }
      });

      ws.on('close', () => {
        logger.info(`[Desktop Gateway] Desktop App disconnected: ${userId}`);
        this.clients.delete(userId);
      });
    });
    
    logger.info('🚀 Desktop App WebSocket Bridge initialized on Liberty Center One');
  },

  /**
   * Called by SovereignRouter to dispatch a local computer use command to the Desktop App.
   */
  async dispatchComputerUseAction(userId, actionPayload) {
    const ws = this.clients.get(userId);
    if (!ws || ws.readyState !== 1) {
      throw new Error('Desktop App is not currently connected to the Liberty Center One bridge.');
    }
    
    const plaintext = JSON.stringify({
      type: 'execute_mcp_tool',
      payload: actionPayload
    });

    // Encrypt the payload using AES-256-GCM
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', BARBICAN_AES_KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Transmit the fully encrypted cipher
    ws.send(JSON.stringify({
      iv: iv.toString('hex'),
      ciphertext: encrypted,
      tag: authTag
    }));
  }
};
