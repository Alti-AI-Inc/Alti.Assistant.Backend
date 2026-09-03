import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { ResearchController } from './exaResearch.controller.js';
import { ResearchValidation } from './exaResearch.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create-search',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ResearchValidation.createSearchZodSchema),
  ResearchController.createSearchRecord
);

router.get(
  '/get-all-searches',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getAllSearchRecords
);

router.get(
  '/search-by-id/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getSingleSearchRecord
);

router.patch(
  '/update-search/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ResearchValidation.updateSearchZodSchema),
  ResearchController.updateSearchRecord
);

router.delete(
  '/delete-search/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.deleteSearchRecord
);

export const ResearchRoutes = router;
export default router;
