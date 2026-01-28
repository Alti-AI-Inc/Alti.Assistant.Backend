import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { AiEndpointsController } from './aiEndpoint.controller.js';
const router = express.Router();

router.get(
  '/all-model',
  extractTenantContext,
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getAiEndpointForApp,
);
router.get(
  '/all-model-web',
  extractTenantContext,
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getWebAiEndpoint,
);
router.post(
  '/add-model',
  extractTenantContext,
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.addAiEndpoint,
);
router.patch(
  '/update-model',
  extractTenantContext,
  // auth(ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.updateWebAiEndpoint,
);

export const aiModelEndpointRoutes = router;
