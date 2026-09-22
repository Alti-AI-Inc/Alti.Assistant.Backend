import express from 'express';
import fredController from './fred.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.use(auth());

router.post('/series/observations', fredController.getSeriesObservations);
router.post('/series/search', fredController.searchSeries);
router.post('/series/info', fredController.getSeriesInfo);

export const fredRoutes = router;
