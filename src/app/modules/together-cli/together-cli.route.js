import { Router } from 'express';
import * as ctrl from './together-cli.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

const router = Router();

// ─── AUTH: All Together CLI routes require ADMIN role ────────────────
router.use(auth(ENUM_USER_ROLE.ADMIN));

// ─── MODELS ─────────────────────────────────────────────────────────
router.get('/models', ctrl.listModels);
router.post('/models/upload', ctrl.uploadModel);

// ─── FILES ──────────────────────────────────────────────────────────
router.get('/files', ctrl.listFiles);
router.post('/files/upload', ctrl.uploadFile);
router.post('/files/check', ctrl.checkFile);
router.get('/files/:id', ctrl.retrieveFile);
router.post('/files/:id/content', ctrl.retrieveFileContent);
router.delete('/files/:id', ctrl.deleteFile);

// ─── FINE-TUNING ────────────────────────────────────────────────────
router.get('/fine-tuning', ctrl.listFineTunes);
router.post('/fine-tuning', ctrl.createFineTune);
router.get('/fine-tuning/:id', ctrl.retrieveFineTune);
router.post('/fine-tuning/:id/cancel', ctrl.cancelFineTune);
router.delete('/fine-tuning/:id', ctrl.deleteFineTune);
router.post('/fine-tuning/:id/download', ctrl.downloadFineTune);
router.get('/fine-tuning/:id/checkpoints', ctrl.listCheckpoints);
router.get('/fine-tuning/:id/events', ctrl.listFineTuneEvents);

// ─── ENDPOINTS ──────────────────────────────────────────────────────
router.get('/endpoints', ctrl.listEndpoints);
router.post('/endpoints', ctrl.createEndpoint);
router.get('/endpoints/hardware', ctrl.listHardware);
router.get('/endpoints/availability-zones', ctrl.listAvailabilityZones);
router.get('/endpoints/:id', ctrl.retrieveEndpoint);
router.post('/endpoints/:id/start', ctrl.startEndpoint);
router.post('/endpoints/:id/stop', ctrl.stopEndpoint);
router.patch('/endpoints/:id', ctrl.updateEndpoint);
router.delete('/endpoints/:id', ctrl.deleteEndpoint);

// ─── EVALS ──────────────────────────────────────────────────────────
router.get('/evals', ctrl.listEvals);
router.post('/evals', ctrl.createEval);
router.get('/evals/:id', ctrl.retrieveEval);
router.get('/evals/:id/status', ctrl.evalStatus);

// ─── UTILITY ────────────────────────────────────────────────────────
router.get('/version', ctrl.version);

export default router;
