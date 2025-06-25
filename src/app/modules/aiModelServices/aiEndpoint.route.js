import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { AiEndpointsController } from './aiEndpoint.controller.js';
const router = express.Router();

router.get(
  '/all-model',
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getAiEndpointForApp,
);
router.get(
  '/all-model-web',
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getWebAiEndpoint,
);
router.post(
  '/add-model',
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.addAiEndpoint,
);
router.patch(
  '/update-model',
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.updateWebAiEndpoint,
);

export const aiModelEndpointRoutes = router;
