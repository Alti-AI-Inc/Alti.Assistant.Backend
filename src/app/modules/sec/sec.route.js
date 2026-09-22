
import express from 'express';
import secController from './sec.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.use(auth());

router.get('/search', secController.searchFilings);

export const secRoutes = router;
