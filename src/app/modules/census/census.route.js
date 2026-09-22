import express from 'express';
import censusController from './census.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.use(auth());

router.post('/population', censusController.getPopulationData);
router.post('/economy', censusController.getEconomicData);

export const censusRoutes = router;
