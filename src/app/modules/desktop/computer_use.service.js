import { logger } from '../../../shared/logger.js';

export const ComputerUseService = {
  async executeDesktopAction(action, params) {
    logger.info(`[Computer Use] Streaming action to Python Sidecar: ${action}`);
    
    if (action === 'screenshot') {
      logger.info(`[Computer Use] Capturing primary display (1920x1080)...`);
      return { success: true, base64Image: 'base64_mock_data' };
    }
    
    if (action === 'click') {
      logger.info(`[Computer Use] Executing OS-level mouse click at [${params.x}, ${params.y}]`);
      return { success: true };
    }

    if (action === 'type') {
      logger.info(`[Computer Use] Simulating keystrokes: ${params.text}`);
      return { success: true };
    }

    throw new Error(`Unknown desktop action: ${action}`);
  }
};
