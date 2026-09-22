import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { MassiveController } from './massive.controller.js';

const router = express.Router();

router.use(auth());

router.get('/marketstatus', MassiveController.getMarketStatus);

// Asset-specific routing
router.get('/:assetClass/ticker/:ticker/realtime', MassiveController.getRealtimeTick);
router.post('/:assetClass/subscribe', MassiveController.subscribeRealtime);
router.get('/:assetClass/ticker/:ticker/history', MassiveController.getHistoricalAggregates);
router.get('/:assetClass/ticker/:ticker/details', MassiveController.getTickerDetails);

export const MassiveRoutes = router;
export default MassiveRoutes;
