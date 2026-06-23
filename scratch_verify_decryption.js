import mongoose from 'mongoose';
import dotenv from 'dotenv';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { conversationHelpers } from './src/app/modules/conversations/conversation.helpers.js';

dotenv.config();

const dbUri = config.database_local || process.env.DATABASE_LOCAL;

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    // Create a temporary conversation
    const conversationId = 'verify-decrypt-test-' + Date.now();
    const userId = new mongoose.Types.ObjectId();
    const testTitle = 'What time is it?';
    const testMessageContent = 'The current time is 12:00 PM';

    console.log('Inserting test conversation...');
    const conv = new Conversation({
      conversationId,
      userId,
      title: testTitle,
      messages: [
        { role: 'user', content: 'what time is it?' },
        { role: 'assistant', content: testMessageContent }
      ],
      is_saved: true,
      status: 'active'
    });

    await conv.save();
    console.log('Test conversation saved.');

    // 1. Test getConversationById
    console.log('\n--- 1. Testing getConversationById ---');
    const byId = await conversationHelpers.getConversationById(conversationId, userId.toString());
    console.log('Title:', byId.title);
    console.log('First Message:', byId.messages[0].content);
    if (byId.title !== testTitle || byId.messages[1].content !== testMessageContent) {
      console.error('FAIL: getConversationById decryption failed!');
      console.log('Expected Title:', testTitle, 'Got:', byId.title);
      console.log('Expected Content:', testMessageContent, 'Got:', byId.messages[1].content);
      process.exit(1);
    }
    console.log('PASS: getConversationById decrypted successfully.');

    // 2. Test getUserConversations
    console.log('\n--- 2. Testing getUserConversations ---');
    const userConvs = await conversationHelpers.getUserConversations(userId.toString());
    console.log('Conversations count:', userConvs.conversations.length);
    if (userConvs.conversations.length > 0) {
      console.log('Title:', userConvs.conversations[0].title);
      if (userConvs.conversations[0].title !== testTitle) {
        console.error('FAIL: getUserConversations decryption failed!');
        process.exit(1);
      }
    } else {
      console.error('FAIL: No conversations found in getUserConversations');
      process.exit(1);
    }
    console.log('PASS: getUserConversations decrypted successfully.');

    // 3. Test getConversationMessages
    console.log('\n--- 3. Testing getConversationMessages ---');
    const messagesObj = await conversationHelpers.getConversationMessages(conversationId, userId.toString());
    console.log('Title:', messagesObj.title);
    console.log('Messages count:', messagesObj.messages.length);
    if (messagesObj.messages.length > 0) {
      console.log('First Message Content:', messagesObj.messages[0].content);
      console.log('Second Message Content:', messagesObj.messages[1].content);
      if (messagesObj.title !== testTitle || messagesObj.messages[0].content !== 'what time is it?') {
        console.error('FAIL: getConversationMessages decryption failed!');
        process.exit(1);
      }
    } else {
      console.error('FAIL: No messages found in getConversationMessages');
      process.exit(1);
    }
    console.log('PASS: getConversationMessages decrypted successfully.');

    // Clean up
    console.log('\nCleaning up test conversation...');
    await Conversation.deleteOne({ conversationId });
    console.log('Cleanup complete.');

    console.log('\nALL LOCAL DECRYPTION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Database connection / verification failed:', err);
    process.exit(1);
  });
