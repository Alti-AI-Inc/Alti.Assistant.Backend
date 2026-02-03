import express from 'express';
import { composioV2Controller } from './composio.v2.controller.js';
import auth from '../../../middlewares/auth.js';

const router = express.Router();

// Apply auth middleware to ensure we have user context
router.post('/initiate', auth(), composioV2Controller.initiateConnection);
router.get('/user-connections', auth(), composioV2Controller.getUserConnections);

export const composioV2Routes = router;
