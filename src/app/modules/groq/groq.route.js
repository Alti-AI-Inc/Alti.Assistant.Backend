import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { LlamaAiController } from './groq.controller.js';
const router = express.Router();

router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  LlamaAiController.GroqAiGetResponse
);
router.post(
  '/get-response-anonymously',
  LlamaAiController.GroqAiGetResponseAnonymously
);

router.get(
  '/get-response-from-db',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  LlamaAiController.LlamaAiGetResponseFromDbByUserId
);

router.get(
  '/get-response-by-sessionid/:sessionId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  LlamaAiController.LlamaAiGetResponseFromDbBySessionId
);

router.delete(
  '/delete-single-response/:objectId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  LlamaAiController.deleteOneAiSession
);

router.delete(
  '/delete-all-response-from-db',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  LlamaAiController.deleteAllAiSessions
);

export const llamaAiRoutes = router;
