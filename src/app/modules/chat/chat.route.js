import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import promptLimiter from '../../middlewares/promptLimiter.js';
import { ChatAiController } from './chat.controller.js';

const router = express.Router();

// All chat endpoints require authentication
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER));

// ── Chat Sessions (sidebar) ──────────────────────────────────────────────────
// GET /api/v1/chat/sessions?page=1&limit=50
router.get('/sessions', ChatAiController.listSessions);

// GET /api/v1/chat/sessions/search?q=python
router.get('/sessions/search', ChatAiController.searchHistory);

// GET /api/v1/chat/sessions/:sessionId
router.get('/sessions/:sessionId', ChatAiController.getSession);

// PATCH /api/v1/chat/sessions/:sessionId  { title: "New Title" }
router.patch('/sessions/:sessionId', ChatAiController.renameSession);

// DELETE /api/v1/chat/sessions/:sessionId
router.delete('/sessions/:sessionId', ChatAiController.deleteSession);

// DELETE /api/v1/chat/sessions (delete all)
router.delete('/sessions', ChatAiController.deleteAllSessions);

// GET /api/v1/chat/sessions/:sessionId/export?format=json|markdown
router.get('/sessions/:sessionId/export', ChatAiController.exportSession);

// ── Send Message (prompt-limited) ────────────────────────────────────────────
// POST /api/v1/chat/get-response  { prompt, sessionId }
router.post('/get-response', promptLimiter, ChatAiController.ChatAiGetResponse);

export const chatAiRoutes = router;
export default router;