import express from 'express';
import { chatbotController } from './chatbot.controller.js';
import auth from '../../middlewares/auth.js';
import { ENUM_USER_ROLE } from '../../../enums/user.js';

const router = express.Router();

router.use(auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN));

router
  .route('/')
  .post(chatbotController.createChatbot)
  .get(chatbotController.getChatbots);

router
  .route('/:id')
  .get(chatbotController.getChatbotById)
  .patch(chatbotController.updateChatbot)
  .delete(chatbotController.deleteChatbot);

export const chatbotRoutes = router;
