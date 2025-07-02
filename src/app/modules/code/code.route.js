import express from 'express';
import { codeController } from './code.controller.js';

const router = express.Router();

console.log('Code routes initialized');

router.post('/assistant', codeController.codeTask);

export const codeRoutes = router;