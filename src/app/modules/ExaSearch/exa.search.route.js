import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { SearchController } from './exaSearch.controller.js';
import { SearchValidation } from './exaSearch.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

// -----------------------------------------------------------------------
// Search result CRUD — always nested under /spaces/:spaceId/searches
// so every request carries its isolation boundary explicitly.
// -----------------------------------------------------------------------
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    validateRequest(SearchValidation.createSearchZodSchema),
    SearchController.createSearchRecord
  )
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SearchController.getAllSearchRecords
  );

router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SearchController.getSingleSearchRecord
  )
  .patch(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    validateRequest(SearchValidation.updateSearchZodSchema),
    SearchController.updateSearchRecord
  )
  .delete(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
    SearchController.deleteSearchRecord
  );

export const SearchRoutes = router;
export default router;
