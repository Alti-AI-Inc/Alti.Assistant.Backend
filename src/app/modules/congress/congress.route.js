import express from 'express';
import congressController from './congress.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.use(auth());

router.post('/bill/detail', congressController.getBill);
router.post('/bill/recent', congressController.getRecentBills);
router.post('/members', congressController.getMembers);

export const congressRoutes = router;
