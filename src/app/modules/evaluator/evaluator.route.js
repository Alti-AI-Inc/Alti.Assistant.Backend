import express from 'express';
import { EvaluatorController } from './evaluator.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.post('/evaluate', auth(), EvaluatorController.evaluate);
router.post('/compare', auth(), EvaluatorController.compare);
router.post('/rubric', auth(), EvaluatorController.rubric);

export const EvaluatorRoutes = router;
