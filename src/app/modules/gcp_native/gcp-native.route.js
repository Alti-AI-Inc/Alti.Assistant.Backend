import express from 'express';
import multer from 'multer';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { GcpNativeController } from './gcp-native.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.post(
  '/grounded-chat',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.groundedChat
);

router.post(
  '/document-ai',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('document'),
  GcpNativeController.processDocumentFile
);

export const gcpNativeRoutes = router;
