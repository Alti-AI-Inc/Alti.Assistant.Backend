import express from 'express';
import { GoogleSearchController } from './google-search.controller.js';

const router = express.Router();

router
  .route('/get-response-anonymously')
  .post(GoogleSearchController.GoogleSearchGetResponse);

export const googleSearchRoutes = router;
