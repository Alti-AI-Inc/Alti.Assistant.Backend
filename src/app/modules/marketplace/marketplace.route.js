import express from 'express';
import auth from '../../middlewares/auth.js';
import { MarketplaceController } from './marketplace.controller.js';

const router = express.Router();

router.post('/install', auth(), MarketplaceController.installApp);
router.post('/uninstall', auth(), MarketplaceController.uninstallApp);
router.get('/installed', auth(), MarketplaceController.getInstalledApps);

export const MarketplaceRoutes = router;
