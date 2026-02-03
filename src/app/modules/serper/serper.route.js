import express from 'express';
import { SerperAiController } from './serper.controller.js';

const router = express.Router();

router.route('/get-response').post(SerperAiController.SerperAiGetResponse);

export const serperAiRoutes = router;
