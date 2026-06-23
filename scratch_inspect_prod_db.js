import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set DNS servers:', e);
}
import mongoose from 'mongoose';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { decryptText } from './src/app/modules/conversations/conversation.model.js';

// Use the production DB URI
const dbUri = 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

console.log('Connecting to production DB:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully to production DB!');

    console.log('Fetching latest 5 conversations...');
    const conversations = await Conversation.find({}).sort({ updatedAt: -1 }).limit(5).lean();

    console.log(`Found ${conversations.length} conversations.`);

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
