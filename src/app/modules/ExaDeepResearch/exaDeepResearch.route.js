import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { DeepResearchController } from './exaDeepResearch.controller.js';
import { DeepResearchValidation } from './exaDeepResearch.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(DeepResearchValidation.createDeepResearchZodSchema),
  DeepResearchController.createDeepResearchRecord
);

router.get(
  '/get-all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  DeepResearchController.getAllDeepResearchRecords
);

router.get(
  '/by-id/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  DeepResearchController.getSingleDeepResearchRecord
);

router.patch(
  '/update/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(DeepResearchValidation.updateDeepResearchZodSchema),
  DeepResearchController.updateDeepResearchRecord
);

router.delete(
  '/delete/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  DeepResearchController.deleteDeepResearchRecord
);

export const DeepResearchRoutes = router;
export default router;
