import mongoose from 'mongoose';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';
import { conversationService } from './src/app/modules/conversations/conversation.service.js';

const dbUri = config.database_local || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');

    const conversationId = 'test-add-message-' + Date.now();
    const userId = new mongoose.Types.ObjectId().toString();

    console.log('--- 1. Testing createConversation ---');
    const conv = await conversationService.createConversation(
      {
        userId,
        title: 'Initial Title',
        initialMessage: { role: 'user', content: 'Initial message content' }
      },
      conversationId
    );

    console.log('Created conversation result:', conv);

    console.log('--- 2. Testing addMessageToConversation ---');
    const msg = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      { role: 'assistant', content: 'Assistant response content' }
    );

    console.log('Added message result:', msg);

    // Fetch from DB to see if it is encrypted in DB
    const rawFromDb = await mongoose.connection.db.collection('conversations').findOne({ conversationId });
    console.log('--- Raw DB document ---');
    console.log('Title in DB:', rawFromDb.title);
    console.log('Messages in DB:', rawFromDb.messages);

    // Clean up
    await Conversation.deleteOne({ conversationId });
    console.log('Cleanup done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
