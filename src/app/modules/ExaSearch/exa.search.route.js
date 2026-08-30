import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { SearchController } from './exaSearch.controller.js';
import { SearchValidation } from './exaSearch.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create-search',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(SearchValidation.createSearchZodSchema),
  SearchController.createSearchRecord
);

router.get(
  '/get-all-searches',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  SearchController.getAllSearchRecords
);

router.get(
  '/search-by-id/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  SearchController.getSingleSearchRecord
);

router.patch(
  '/update-search/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(SearchValidation.updateSearchZodSchema),
  SearchController.updateSearchRecord
);

router.delete(
  '/delete-search/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  SearchController.deleteSearchRecord
);

export const SearchRoutes = router;
export default router;
