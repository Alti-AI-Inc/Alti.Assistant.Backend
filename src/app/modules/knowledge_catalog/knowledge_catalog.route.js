import express from 'express';
import multer from 'multer';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import * as knowledgeCatalogController from './knowledge_catalog.controller.js';
import { createBundleSchema, searchCatalogSchema } from './knowledge_catalog.validation.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const authRoles = [
  ENUM_USER_ROLE.USER,
  ENUM_USER_ROLE.MANAGER,
  ENUM_USER_ROLE.ADMIN,
  ENUM_USER_ROLE.SUPER_ADMIN
];

router.post(
  '/bundles',
  auth(...authRoles),
  extractTenantContext,
  upload.single('file'),
  validateRequest(createBundleSchema),
  knowledgeCatalogController.createBundle
);

router.get(
  '/bundles',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.listBundles
);

router.get(
  '/bundles/:id',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.getBundleDetails
);

router.delete(
  '/bundles/:id',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.deleteBundle
);

router.get(
  '/bundles/:id/concepts',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.listBundleConcepts
);

router.get(
  '/bundles/:id/concepts/:conceptId',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.getConcept
);

router.post(
  '/bundles/:id/enrich',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.enrichBundle
);

router.get(
  '/bundles/:id/export',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.exportBundle
);

router.post(
  '/search',
  auth(...authRoles),
  extractTenantContext,
  validateRequest(searchCatalogSchema),
  knowledgeCatalogController.searchCatalog
);

router.get(
  '/graph',
  auth(...authRoles),
  extractTenantContext,
  knowledgeCatalogController.getCatalogGraph
);

export const knowledgeCatalogRoutes = router;
export default router;
