import express from 'express';
import arxivController from './arxiv.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.use(auth());

router.post('/query', arxivController.searchPapers);

export const arxivRoutes = router;
