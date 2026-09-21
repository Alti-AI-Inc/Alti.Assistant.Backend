import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { AgentController } from './agents.controller.js';

const router = express.Router();

router.use(auth());

router.post('/', AgentController.createAgent);
router.get('/', AgentController.listAgents);
router.get('/:id', AgentController.getAgent);
router.put('/:id', AgentController.updateAgent);
router.delete('/:id', AgentController.deleteAgent);
router.post('/:id/execute', AgentController.executeAgent);
router.post('/:id/execute/stream', AgentController.executeAgentStream);
router.post('/:id/swarm', AgentController.spawnSwarm);
router.get('/:id/runs', AgentController.getAgentRuns);
router.get('/:id/runs/:runId', AgentController.getRunDetails);
router.post('/:id/duplicate', AgentController.duplicateAgent);
router.patch('/:id/status', AgentController.updateStatus);

export const AgentRoutes = router;
