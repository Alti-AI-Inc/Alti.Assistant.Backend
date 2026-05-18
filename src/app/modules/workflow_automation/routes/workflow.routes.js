import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import optionalAuth from '../../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Workflow management routes
router.get('/', auth(), workflowController.getUserWorkflowsController);
router.get('/:workflowId', auth(), workflowController.getWorkflowController);
router.put('/:workflowId', auth(), workflowController.updateWorkflowController);
router.delete(
  '/:workflowId',
  auth(),
  workflowController.deleteWorkflowController
);
router.patch(
  '/:workflowId/status',
  auth(),
  workflowController.toggleWorkflowStatusController
);

// Template routes
router.get(
  '/templates/list',
  optionalAuth(),
  workflowController.getWorkflowTemplatesController
);
router.post(
  '/templates/:templateId/create',
  auth(),
  workflowController.createFromTemplateController
);

export const workflowRoutes = router;
