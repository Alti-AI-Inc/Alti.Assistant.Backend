import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { GcpNativeController } from './gcp-native.controller.js';

const router = express.Router();

router.get(
  '/search-catalog',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.searchCatalog
);

router.post(
  '/import',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.importSubmodule
);

export const gcpNativeRoutes = router;
