import express from "express";
import writingController from "./writer.controller.js";
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const router = express.Router();

router.post(
  "/assistant",
  optionalAuth(),
  extractTenantContext,
  writingController
);

export const writingRoutes = router;