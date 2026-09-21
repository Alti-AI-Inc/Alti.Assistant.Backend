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

export const ResearchRoutes = router;
export default router;