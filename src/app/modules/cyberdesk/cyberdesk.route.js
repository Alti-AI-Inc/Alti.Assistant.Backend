import express from 'express';
import { cyberdeskController } from './cyberdesk.controller.js';

const router = express.Router();

router.post('/launch', cyberdeskController.launch);
router.get('/info/:id', cyberdeskController.info);
router.post('/click/:id', cyberdeskController.click);
router.post('/bash/:id', cyberdeskController.bash);
router.delete('/terminate/:id', cyberdeskController.terminate);

export const cyberdeskRoutes = router;
