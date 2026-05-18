import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { SupportController } from './support.controller.js';
import { supportValidationSchema } from './support.validation.js';
const router = express.Router();

router
  .route('/req-support/:id')
  .post(
    validateRequest(supportValidationSchema),
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.reqForSupport
  );

router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.getSupportById
  );
router
  .route('/update-support-req/:id')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.updateSupportReq
  );
router
  .route('/delete-support-req/:id')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.deleteSupportReq
  );

router
  .route('/all-support')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.getAllSupportReq
  );

router.route('/bulk-delete').delete(SupportController.bulkDeleteSupportReq);

export const supportRoutes = router;
