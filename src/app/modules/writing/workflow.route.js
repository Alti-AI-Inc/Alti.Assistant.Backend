import express from "express";
import writingController from "./writer.controller.js";

const router = express.Router();

router.post(
  "/assistant", writingController
);

export const writingRoutes = router;