import express from "express";
import { createImageIntentController } from "../controllers/imageIntentController.js";

export const createImageIntentRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createImageIntentController(sessionManager);

  router.post("/analyze-intent", controller.analyzeIntent);

  return router;
};
