import express from "express";
import { searchController } from "./search.controller.js";

const router = express.Router();

router.post(
  '/assistant',
  searchController
);
export const searchRoute = router;