import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { SearchRoutes } from './exa.search.route.js';
import { SpaceController } from './exaSearch.space.controller.js';
import { SpaceValidation } from './exaValidation.model.js';

const router = express.Router();

// -----------------------------------------------------------------------
// Space CRUD
// -----------------------------------------------------------------------
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    validateRequest(SpaceValidation.createSpaceZodSchema),
    SpaceController.createSpace
  )
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SpaceController.getAllSpaces
  );

router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SpaceController.getSingleSpace
  )
  .patch(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    validateRequest(SpaceValidation.updateSpaceZodSchema),
    SpaceController.updateSpace
  )
  .delete(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SpaceController.deleteSpace
  );

// -----------------------------------------------------------------------
// Space membership (owner-only actions, enforced in the service layer)
// -----------------------------------------------------------------------
router
  .route('/:id/members')
  .post(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    validateRequest(SpaceValidation.addMemberZodSchema),
    SpaceController.addMember
  );

router
  .route('/:id/members/:memberId')
  .delete(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SpaceController.removeMember
  );

// Nested search routes are always scoped under a specific space.
router.use('/:spaceId/searches', SearchRoutes);

export const SpaceRoutes = router;
export default router;
