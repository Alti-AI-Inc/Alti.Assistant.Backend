import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { ResearchController } from './exaResearch.controller.js';
import { ResearchValidation } from './exaResearch.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create-research',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ResearchValidation.createSearchZodSchema),
  ResearchController.createSearchRecord
);

router.get(
  '/get-all-researches',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getAllSearchRecords
);

router.get(
  '/research-by-id/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getSingleSearchRecord
);

// Manual refresh from Exa — use while waiting for the webhook, or as a
// fallback if webhooks aren't set up for this environment.
router.get(
  '/sync-research/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.syncSearchRecord
);

router.patch(
  '/update-research/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ResearchValidation.updateSearchZodSchema),
  ResearchController.updateSearchRecord
);

router.delete(
  '/delete-research/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.deleteSearchRecord
);

router.post(
  '/answer',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.answer
);

// Batches API
router.post(
  '/batches',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.createBatch
);

router.get(
  '/batches/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getBatch
);

// Team & Usage API
router.get(
  '/team/me',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.getTeamUsage
);

router.get(
  '/team/api-keys',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  ResearchController.listTeamApiKeys
);

// ── Batch: list, cancel, delete ──────────────────────────────────────────────
router.get('/batches', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.listBatches);
router.post('/batches/:id/cancel', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.cancelBatch);
router.delete('/batches/:id', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.deleteBatch);

// ── Websets: core CRUD ───────────────────────────────────────────────────────
router.get('/websets', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.listWebsets);
router.post('/websets/preview', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.previewWebset);
router.patch('/websets/:websetId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.updateWebset);
router.delete('/websets/:websetId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.deleteWebset);
router.post('/websets/:websetId/cancel', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.cancelWebset);

// ── Websets > Items ──────────────────────────────────────────────────────────
router.get('/websets/:websetId/items', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.listWebsetItems);
router.get('/websets/:websetId/items/:itemId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.getWebsetItem);
router.delete('/websets/:websetId/items/:itemId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.deleteWebsetItem);

// ── Websets > Searches ───────────────────────────────────────────────────────
router.post('/websets/:websetId/searches', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.createWebsetSearch);
router.get('/websets/:websetId/searches/:searchId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.getWebsetSearch);
router.post('/websets/:websetId/searches/:searchId/cancel', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.cancelWebsetSearch);

// ── Websets > Enrichments ────────────────────────────────────────────────────
router.post('/websets/:websetId/enrichments', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.createWebsetEnrichment);
router.get('/websets/:websetId/enrichments/:enrichmentId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.getWebsetEnrichment);
router.patch('/websets/:websetId/enrichments/:enrichmentId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.updateWebsetEnrichment);
router.delete('/websets/:websetId/enrichments/:enrichmentId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.deleteWebsetEnrichment);
router.post('/websets/:websetId/enrichments/:enrichmentId/cancel', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.cancelWebsetEnrichment);

// ── Websets > Imports ────────────────────────────────────────────────────────
router.post('/websets/:websetId/imports', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.createWebsetImport);
router.get('/websets/:websetId/imports', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.listWebsetImports);
router.get('/websets/:websetId/imports/:importId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.getWebsetImport);
router.patch('/websets/:websetId/imports/:importId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.updateWebsetImport);
router.delete('/websets/:websetId/imports/:importId', auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN), ResearchController.deleteWebsetImport);

export const ResearchRoutes = router;
export default router;