import mongoose from 'mongoose';
import dotenv from 'dotenv';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { decryptText } from './src/app/modules/conversations/conversation.model.js';

dotenv.config();

const dbUri = config.database_local || process.env.DATABASE_LOCAL;

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    console.log('Fetching latest 5 conversations...');
    const conversations = await Conversation.find({}).sort({ updatedAt: -1 }).limit(5).lean();

    for (const conv of conversations) {
      console.log(`\n=========================================`);
      console.log(`Conversation ID: ${conv.conversationId}`);
      console.log(`User ID: ${conv.userId}`);
      console.log(`Updated At: ${conv.updatedAt}`);
      console.log(`Raw Title in DB: "${conv.title}"`);
      
      const decryptedTitle = decryptText(conv.title);
      console.log(`Decrypted Title: "${decryptedTitle}"`);

      if (conv.messages && conv.messages.length > 0) {
        console.log(`Messages (${conv.messages.length}):`);
        conv.messages.slice(0, 3).forEach((msg, idx) => {
          console.log(`  Message ${idx + 1} (${msg.role}):`);
          console.log(`    Raw Content: "${msg.content}"`);
          console.log(`    Decrypted Content: "${decryptText(msg.content)}"`);
        });
      } else {
        console.log('No messages in this conversation.');
      }
    }

    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
