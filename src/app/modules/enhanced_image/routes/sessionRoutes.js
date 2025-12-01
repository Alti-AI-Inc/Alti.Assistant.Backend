import express from "express";
import { createSessionController } from "../controllers/sessionController.js";

export const createSessionRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createSessionController(sessionManager);

  router.post("/start", controller.startSession);
  router.delete("/:sessionId", controller.deleteSession);

  return router;
};
