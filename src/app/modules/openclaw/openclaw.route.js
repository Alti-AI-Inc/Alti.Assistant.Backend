import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { OpenClawController } from './openclaw.controller.js';

const router = express.Router();

router.use(auth());

// Daemon Agent Lifecycle
router.post('/agents', OpenClawController.createAgent);
router.get('/agents/:agentId', OpenClawController.getAgent);
router.post('/agents/:agentId/message', OpenClawController.sendMessage);

// Skills & Execution
router.get('/skills', OpenClawController.listSkills);
router.post('/skills/execute', OpenClawController.executeSkill);

// Local-First Web Crawl
router.post('/crawl', OpenClawController.crawlUrl);

// Repository Intelligence Orchestration
router.post('/intelligence/repository', OpenClawController.analyzeRepository);

export const OpenClawRoutes = router;
export default OpenClawRoutes;
