import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { openAIAiController } from './openAi.controller.js';

const router = express.Router();

router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  openAIAiController.Gpt4oMiniGetResponse,
);

router.post(
  '/4nano/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  openAIAiController.Gpt4NanoGetResponse,
);

export const openAIAiRoutes = router;
