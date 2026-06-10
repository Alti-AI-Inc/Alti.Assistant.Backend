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

/**
 * @openapi
 * /chatbots:
 *   post:
 *     summary: Create a new chatbot
 *     description: Creates a new chatbot instance. Accessible by USER, ADMIN, and SUPER_ADMIN roles.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Customer Support Bot"
 *               config:
 *                 type: object
 *                 example: {}
 *     responses:
 *       201:
 *         description: Chatbot created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *   get:
 *     summary: Get all chatbots
 *     description: Retrieves a list of chatbots. Regular users will only see their own chatbots, while admins/super_admins can see all.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chatbots retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
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

/**
 * @openapi
 * /chatbots/{id}:
 *   get:
 *     summary: Get chatbot by ID
 *     description: Retrieves details of a specific chatbot by its ID. Users can only access their own chatbots.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     responses:
 *       200:
 *         description: Chatbot details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Chatbot not found
 *   patch:
 *     summary: Update chatbot by ID
 *     description: Updates an existing chatbot. Restricted to ADMIN and SUPER_ADMIN roles.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Chatbot updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Chatbot not found
 *   delete:
 *     summary: Delete chatbot by ID
 *     description: Deletes a specific chatbot. Restricted to ADMIN and SUPER_ADMIN roles.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     responses:
 *       200:
 *         description: Chatbot deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Chatbot not found
 */
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

/**
 * Express router for chatbot-related endpoints.
 * Defines routes for creating, reading, updating, and deleting chatbots with role-based access control.
 * 
 * @type {import('express').Router}
 */
export const chatbotRoutes = router;