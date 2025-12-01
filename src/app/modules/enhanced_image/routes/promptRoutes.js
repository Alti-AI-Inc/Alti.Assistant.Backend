import express from "express";
import { createPromptController } from "../controllers/promptController.js";

export const createPromptRoutes = (sessionManager, promptService) => {
  const router = express.Router();
  const controller = createPromptController(sessionManager, promptService);

  router.post("/evaluate", controller.evaluatePrompt);
  router.post("/add-detail", controller.addDetail);
  router.post("/finalize", controller.finalizePrompt);

  return router;
};
