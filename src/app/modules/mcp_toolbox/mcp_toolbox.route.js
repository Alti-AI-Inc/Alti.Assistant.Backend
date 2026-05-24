import express from 'express';
import { mcpToolboxController } from './mcp_toolbox.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.post(
  '/connect',
  auth(),
  mcpToolboxController.connectController
);

router.post(
  '/query',
  auth(),
  mcpToolboxController.queryController
);

router.post(
  '/disconnect',
  auth(),
  mcpToolboxController.disconnectController
);

router.get(
  '/status',
  auth(),
  mcpToolboxController.statusController
);

export const mcpToolboxRoutes = router;
