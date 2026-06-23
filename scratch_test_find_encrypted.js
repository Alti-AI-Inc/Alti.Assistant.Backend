import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from './src/app/modules/conversations/conversation.model.js';

dotenv.config();

const dbUri = process.env.DATABASE_LOCAL;

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    // Find the 100 newest conversations
    const conversations = await Conversation.find({}).sort({ createdAt: -1 }).limit(100).lean();
    console.log('Total conversations fetched:', conversations.length);

    let encryptedCount = 0;
    for (const conv of conversations) {
      const isEncrypted = conv.title && conv.title.includes(':') && conv.title.split(':')[0].length === 32;
      if (isEncrypted) {
        encryptedCount++;
        console.log(`Encrypted Conversation [${conv.conversationId}]:`);
        console.log('  Title:', conv.title);
        if (conv.messages && conv.messages.length > 0) {
          console.log('  First Message Role:', conv.messages[0].role);
          console.log('  First Message Content:', conv.messages[0].content);
        }
      }
    }

    console.log('Total encrypted conversations in newest 100:', encryptedCount);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
