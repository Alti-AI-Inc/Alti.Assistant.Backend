import mongoose from 'mongoose';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { decryptConversation } from './src/app/modules/conversations/conversation.helpers.js';

const dbUri = config.database_local || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    // Fetch the 5 most recently updated conversations
    const rawConversations = await mongoose.connection.db.collection('conversations')
      .find({})
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray();

    console.log('\n--- 1. Raw DB Conversations (directly from MongoDB client) ---');
    for (const c of rawConversations) {
      console.log(`\nConversation ID: ${c.conversationId}`);
      console.log(`Raw Title: ${c.title}`);
      console.log(`Message Count: ${c.messages?.length || 0}`);
      if (c.messages && c.messages.length > 0) {
        console.log('First Message:');
        console.log(`  Role: ${c.messages[0].role}`);
        console.log(`  Raw Content: ${c.messages[0].content}`);
      }
    }

    console.log('\n--- 2. Mongoose Decrypted Conversations ---');
    const mongooseConversations = await Conversation.find({})
      .sort({ updatedAt: -1 })
      .limit(5);

    for (const c of mongooseConversations) {
      console.log(`\nConversation ID: ${c.conversationId}`);
      console.log(`Decrypted Title: ${c.title}`);
      if (c.messages && c.messages.length > 0) {
        console.log('First Message:');
        console.log(`  Role: ${c.messages[0].role}`);
        console.log(`  Decrypted Content: ${c.messages[0].content}`);
      }
    }

    console.log('\n--- 3. Mongoose Lean Decrypted Conversations ---');
    const leanConversations = await Conversation.find({})
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    for (const c of leanConversations) {
      const decrypted = decryptConversation(c);
      console.log(`\nConversation ID: ${decrypted.conversationId}`);
      console.log(`Decrypted Title: ${decrypted.title}`);
      if (decrypted.messages && decrypted.messages.length > 0) {
        console.log('First Message:');
        console.log(`  Role: ${decrypted.messages[0].role}`);
        console.log(`  Decrypted Content: ${decrypted.messages[0].content}`);
      }
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to run verification script:', err);
    process.exit(1);
  });
