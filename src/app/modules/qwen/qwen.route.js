import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { QwenAiController } from './qwen.controller.js';

const router = express.Router();

router.post(
  '/coder/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  QwenAiController.QwenAiGetResponse
);
router.post(
  '/qwq/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  QwenAiController.QwenQWQAiGetResponse
);

export const qwenAiRoutes = router;
