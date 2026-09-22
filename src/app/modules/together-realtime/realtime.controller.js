import { llmRealtimeTTSConfig, llmRealtimeSTTConfig } from '../../services/llm.client.js';
import { logger } from '../../../shared/logger.js';
import { WebSocket } from 'ws';

/**
 * Together AI Realtime WebSocket Controller
 * Proxies bidirectional audio between client and Together AI WebSocket APIs
 */
export const RealtimeController = {
  /**
   * GET /api/v1/together-realtime/tts-config
   * Returns WebSocket connection config for client-side TTS
   */
  getTTSConfig(req, res) {
    try {
      const voice = req.query.voice || 'helpful woman';
      const format = req.query.format || 'raw';
      const sampleRate = parseInt(req.query.sample_rate) || 24000;
      
      const config = llmRealtimeTTSConfig({ voice, format, sampleRate });
      res.json({ success: true, config });
    } catch (error) {
      logger.error('[RealtimeController] TTS config error:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/v1/together-realtime/stt-config
   * Returns WebSocket connection config for client-side STT
   */
  getSTTConfig(req, res) {
    try {
      const language = req.query.language || 'en';
      const interimResults = req.query.interim_results !== 'false';
      
      const config = llmRealtimeSTTConfig({ language, interimResults });
      res.json({ success: true, config });
    } catch (error) {
      logger.error('[RealtimeController] STT config error:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * WebSocket upgrade handler for /api/v1/together-realtime/ws
   * Proxies audio between client WebSocket and Together AI WebSocket
   */
  handleWebSocketUpgrade(wss) {
    return (ws, req) => {
      const mode = req.url?.includes('mode=tts') ? 'tts' : 'stt';
      logger.info(`[RealtimeController] WebSocket connection: mode=${mode}`);

      let togetherConfig;
      if (mode === 'tts') {
        togetherConfig = llmRealtimeTTSConfig({
          voice: req.url?.match(/voice=([^&]+)/)?.[1] || 'helpful woman'
        });
      } else {
        togetherConfig = llmRealtimeSTTConfig({
          language: req.url?.match(/language=([^&]+)/)?.[1] || 'en'
        });
      }

      // Connect to Together AI WebSocket
      const togetherWs = new WebSocket(togetherConfig.url, {
        headers: togetherConfig.headers
      });

      togetherWs.on('open', () => {
        logger.info(`[RealtimeController] Together AI WebSocket connected (${mode})`);
        // Send initial configuration
        if (togetherConfig.params) {
          togetherWs.send(JSON.stringify({
            type: 'session.update',
            session: togetherConfig.params
          }));
        }
      });

      // Proxy messages: Client → Together
      ws.on('message', (data) => {
        if (togetherWs.readyState === WebSocket.OPEN) {
          togetherWs.send(data);
        }
      });

      // Proxy messages: Together → Client
      togetherWs.on('message', (data) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(data);
        }
      });

      // Handle disconnections
      ws.on('close', () => {
        logger.info(`[RealtimeController] Client disconnected (${mode})`);
        togetherWs.close();
      });

      togetherWs.on('close', () => {
        logger.info(`[RealtimeController] Together AI disconnected (${mode})`);
        if (ws.readyState === 1) ws.close();
      });

      togetherWs.on('error', (err) => {
        logger.error(`[RealtimeController] Together AI WS error: ${err.message}`);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      });

      ws.on('error', (err) => {
        logger.error(`[RealtimeController] Client WS error: ${err.message}`);
        togetherWs.close();
      });
    };
  }
};

export default RealtimeController;
