import express from 'express';
import { ComposioCatalogController } from './composio-catalog.controller.js';

const router = express.Router();

router.get('/repositories', ComposioCatalogController.getRepositories);
router.get('/stats', ComposioCatalogController.getStats);
router.post('/import', ComposioCatalogController.importSubmodule);

export const composioCatalogRoutes = router;
