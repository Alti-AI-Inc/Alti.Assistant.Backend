import express from 'express';
import { TogetherAiController } from './togeterAi.controller.js';
const router = express.Router();

router.route('/create-img').post(TogetherAiController.TogetherAiImgGeneration);


export const togetherAiRoutes = router;
