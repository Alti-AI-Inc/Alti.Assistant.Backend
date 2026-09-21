import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import WorkflowController from './workflows.controller.js';

const router = express.Router();

router.use(auth());

router.post('/', WorkflowController.createWorkflow);
router.get('/', WorkflowController.listWorkflows);
router.get('/:id', WorkflowController.getWorkflow);
router.put('/:id', WorkflowController.updateWorkflow);
router.delete('/:id', WorkflowController.deleteWorkflow);

router.post('/:id/execute', WorkflowController.executeWorkflow);
router.post('/:id/execute/stream', WorkflowController.executeWorkflowStream);
router.patch('/:id/status', WorkflowController.updateStatus);
router.post('/:id/steps/:stepId/approve', WorkflowController.approveStep);
router.get('/:id/runs', WorkflowController.getWorkflowRuns);

export const WorkflowRoutes = router;
export default router;
