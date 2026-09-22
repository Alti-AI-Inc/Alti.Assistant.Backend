import express from 'express';
import openfdaController from './openfda.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.use(auth());

router.post('/drug/search', openfdaController.searchDrugs);
router.post('/drug/events', openfdaController.searchAdverseEvents);

export const openfdaRoutes = router;
