import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { ContentRoutes } from '../ExaContents/contents.route.js';
import { MonitorRoutes } from '../ExaMonitor/monitor.route.js';
import { SearchRoutes } from '../ExaSearch/exa.search.route.js';
import { SpaceController } from './space.controller.js';
import { SpaceValidation } from './space.validation.js';

const router = express.Router();
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
router.use('/:spaceId/searches', SearchRoutes);
router.use('/:spaceId/contents', ContentRoutes);
router.use('/:spaceId/monitors', MonitorRoutes);

export const SpaceRoutes = router;
export default router;
