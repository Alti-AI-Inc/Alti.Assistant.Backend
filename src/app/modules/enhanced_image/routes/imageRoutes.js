import express from "express";
import { createImageController } from "../controllers/imageController.js";

export const createImageRoutes = (sessionManager, imageService, promptService) => {
  const router = express.Router();
  const controller = createImageController(sessionManager, imageService, promptService);

  router.post("/edit", controller.editImage);
  router.post("/generate", controller.generateImage);
  router.post("/generate-direct", controller.generateImageDirect);

  return router;
};
