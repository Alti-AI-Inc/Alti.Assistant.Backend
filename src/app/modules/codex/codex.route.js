import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { CodexController } from './codex.controller.js';

const router = express.Router();

router.use(auth());

// Core code operations
router.post('/generate', CodexController.generateCode);
router.post('/generate/stream', CodexController.generateCodeStream);
router.post('/explain', CodexController.explainCode);
router.post('/refactor', CodexController.refactorCode);
router.post('/review', CodexController.reviewCode);
router.post('/execute', CodexController.executeCode);

// Extended operations
router.post('/complete', CodexController.completeCode);
router.post('/translate', CodexController.translateCode);
router.post('/tests', CodexController.generateTests);
router.post('/docs', CodexController.generateDocs);
router.post('/debug', CodexController.debugCode);

export const CodexRoutes = router;
export default CodexRoutes;
