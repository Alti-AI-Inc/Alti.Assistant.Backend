import express from 'express';
import { chatbotController } from './chatbot.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

const router = express.Router();

// BUG/SECURITY VULNERABILITY: The previous global `router.use(auth(...))` was too permissive.
// It allowed regular `USER` roles to perform `patch` (update) and `delete` operations on any chatbot
// by ID, which is a potential Insecure Direct Object Reference (IDOR) or privilege escalation vulnerability.
//
// FIX: Apply specific authorization roles to each route based on the principle of least privilege.
// - `createChatbot` and `getChatbots`/`getChatbotById` can be accessed by `USER`, `ADMIN`, `SUPER_ADMIN`.
//   (Assuming `getChatbotById` and `getChatbots` in the controller will filter by user ownership for `USER` role).
// - `updateChatbot` and `deleteChatbot` are restricted to `ADMIN` and `SUPER_ADMIN` roles at the route level
//   to prevent unauthorized modification/deletion by regular users. If a `USER` is intended to update/delete
//   their *own* chatbots, robust object-level ownership checks must be implemented within the controller,
//   and the `auth` middleware for these routes would need to include `ENUM_USER_ROLE.USER` again.
//   For a safer default, restricting at the route level is preferred.

router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
    chatbotController.createChatbot
  )
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
    chatbotController.getChatbots
  );

router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
    chatbotController.getChatbotById
  )
  .patch(
    auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
    chatbotController.updateChatbot
  )
  .delete(
    auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
    chatbotController.deleteChatbot
  );

export const chatbotRoutes = router;