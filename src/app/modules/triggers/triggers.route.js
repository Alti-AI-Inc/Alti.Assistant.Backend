import express from 'express';
import { TriggerController } from './triggers.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// Webhook endpoint (Public, NO Auth)
router.post('/webhook/:webhookId', TriggerController.handleWebhook);

// Protected routes
router.use(auth());

router.post('/', TriggerController.createTrigger);
router.get('/', TriggerController.listTriggers);
router.post('/event', TriggerController.handleEvent);

router.get('/:id', TriggerController.getTrigger);
router.put('/:id', TriggerController.updateTrigger);
router.delete('/:id', TriggerController.deleteTrigger);

router.patch('/:id/status', TriggerController.updateStatus);
router.post('/:id/test', TriggerController.testFire);

export const TriggerRoutes = router;
