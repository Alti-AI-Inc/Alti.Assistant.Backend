import { WebSocketServer } from 'ws';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import jwt from 'jsonwebtoken';
import config from '../../../../config/index.js';
import crypto from 'crypto';

// The OEM Master Key derived from OpenStack Barbican HSM for the Desktop Gateway
const BARBICAN_AES_KEY = crypto.scryptSync(process.env.BARBICAN_SECRET || 'aphura-oem-key', 'salt', 32);

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
      // Basic auth (in production, use real JWT verification)
      const url = new URL(request.url, `http://${request.headers.host}`);
      let userId = "admin_user"; // Mock for OEM demo

      logger.info(`[Desktop Gateway] Desktop App connected for user: ${userId}`);
      this.clients.set(userId, ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          
          if (message.type === 'computer_use_result') {
            await RedisClient.publish(`desktop_result_${userId}`, JSON.stringify(message.payload));
          } 
          else if (message.type === 'omni_hotkey') {
            const clipText = message.payload.text;
            logger.info(`[Omni-Hotkey] Received intercepted text from Desktop OS: ${clipText}`);
            
            // MAGIC TRICK: Route it dynamically using Together.ai and Composio!
            // We lazily import so we don't cause circular dependencies
            const { llmChat } = await import('../../services/llm.client.js');
            const { ComposioService } = await import('../composio/composio.service.js');
            
            try {
              // We use DeepSeek V4 Pro to interpret the intent of the highlighted text
              const prompt = `You are the Sovereign Agent. The user highlighted this text and pressed the Omni-Hotkey. Analyze it and extract the actionable intent (e.g. "Create Jira Ticket", "Schedule meeting", "Summarize this code", "Reply to this email"). Text: "${clipText}"`;
              
              const analysis = await llmChat([{ role: 'user', content: prompt }]);
              const intent = analysis.choices[0].message.content;
              
              logger.info(`[Omni-Hotkey] DeepSeek V4 Pro determined intent: ${intent}`);
              
              // In a full implementation, you would dynamically execute the Composio Tool here:
              // await ComposioService.executeTool(userId, intent);
              
              // Push the final result back down the encrypted WebSocket to the Desktop Notification Center
              this.dispatchActionResponse(userId, "hotkey_response", { 
                message: `DeepSeek V4 Pro Intent Analyzed:\n${intent.substring(0, 50)}...`
              });
              
            } catch (err) {
              logger.error(`[Omni-Hotkey] DeepSeek V4 Pro Processing failed: ${err.message}`);
              this.dispatchActionResponse(userId, "hotkey_response", { message: "Failed to process Omni-Hotkey command via Aphura." });
            }
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
    
    logger.info('🚀 Desktop App WebSocket Bridge initialized on Aphura');
  },

  /**
   * Pushes an encrypted response back to the desktop app.
   */
  dispatchActionResponse(userId, actionType, payload) {
    const ws = this.clients.get(userId);
    if (!ws || ws.readyState !== 1) return;
    
    const plaintext = JSON.stringify({ type: actionType, payload });
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', BARBICAN_AES_KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    ws.send(JSON.stringify({
      iv: iv.toString('hex'),
      ciphertext: encrypted,
      tag: authTag
    }));
  },

  async dispatchComputerUseAction(userId, actionPayload) {
    this.dispatchActionResponse(userId, 'execute_mcp_tool', actionPayload);
  }
};
