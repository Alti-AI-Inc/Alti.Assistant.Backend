import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { conversationHelpers } from './src/app/modules/conversations/conversation.helpers.js';

dotenv.config();

const dbUri = process.env.DATABASE_LOCAL;

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    const conversationId = '87ce9ad6-670f-4da1-8169-92b969400633';
    const conversation = await Conversation.findOne({ conversationId }).lean();

    if (!conversation) {
      console.log('Conversation not found.');
      process.exit(0);
    }

    console.log('Raw title in DB:', conversation.title);
    if (conversation.messages && conversation.messages.length > 0) {
      console.log('Raw first message in DB:', conversation.messages[0].content);
      if (conversation.messages[1]) {
        console.log('Raw second message in DB:', conversation.messages[1].content);
      }
    }

    // Now query it using helper
    const queried = await conversationHelpers.getConversationById(
      conversationId,
      conversation.userId.toString()
    );

    console.log('Queried title:', queried.title);
    if (queried.messages && queried.messages.length > 0) {
      console.log('Queried first message:', queried.messages[0].content);
      if (queried.messages[1]) {
        console.log('Queried second message:', queried.messages[1].content);
      }
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
