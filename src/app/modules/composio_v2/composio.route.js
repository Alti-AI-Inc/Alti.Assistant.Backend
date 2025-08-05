import express from 'express';

const router = express.Router();

import {composioController} from './composio.controller.js';

router.post('/initiate', composioController.composioInitiateController);
router.post('/wait-for-connection', composioController.composioWaitForConnectionController);

export const composioV2Routes = router;