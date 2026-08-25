import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { ContentController } from './contents.controller.js';
import { ContentValidation } from './contents.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });


router.post(
  '/create-content',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ContentValidation.createContentZodSchema),
  ContentController.createContentRecord
);

router.get(
  '/get-all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ContentController.getAllContentRecords
);

router.get(
  '/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ContentController.getSingleContentRecord
);

router.patch(
  '/update-content/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ContentValidation.updateContentZodSchema),
  ContentController.updateContentRecord
);

router.delete(
  '/delete-content/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ContentController.deleteContentRecord
);

export const ContentRoutes = router;
export default router;
