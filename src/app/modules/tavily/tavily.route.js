import express from 'express';
import { TavilyAiController } from './tavily.controller.js';

const router = express.Router();

router
  .route('/get-response-anonymously')
  .post(TavilyAiController.TavilyAiGetResponseAnonymously);

export const tavilyAiRoutes = router;
