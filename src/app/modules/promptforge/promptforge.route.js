import express from 'express';
import { PromptForgeController } from './promptforge.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.get('/templates', auth(), PromptForgeController.listTemplates);
router.post('/render', auth(), PromptForgeController.render);
router.post('/optimize', auth(), PromptForgeController.optimize);
router.post('/analyze', auth(), PromptForgeController.analyze);

export const PromptForgeRoutes = router;
