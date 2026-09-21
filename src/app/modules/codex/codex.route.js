import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { CodexController } from './codex.controller.js';

const router = express.Router();

router.use(auth());

router.post('/generate', CodexController.generateCode);
router.post('/explain', CodexController.explainCode);
router.post('/refactor', CodexController.refactorCode);
router.post('/review', CodexController.reviewCode);
router.post('/execute', CodexController.executeCode);

export const CodexRoutes = router;
export default CodexRoutes;
