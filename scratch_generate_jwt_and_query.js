import mongoose from 'mongoose';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';

dotenv.config();

const dbUri = config.database_local || process.env.DATABASE_LOCAL;
const backendUrl = 'http://127.0.0.1:5100/api/v1';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(dbUri);
  console.log('Connected.');

  // Find the latest conversation in the DB for user 6a2781ef332d955a872ec0e0
  const userId = '6a2781ef332d955a872ec0e0';
  const conv = await Conversation.findOne({ userId }).sort({ updatedAt: -1 }).lean();
  
  if (!conv) {
    console.error('No conversation found for user', userId);
    process.exit(1);
  }
  
  console.log(`Latest Conversation ID: ${conv.conversationId}`);
  console.log(`Raw Title in DB: "${conv.title}"`);
  console.log(`Raw First Message Content in DB: "${conv.messages[0]?.content}"`);

  // Generate a JWT access token for this user
  const tokenSecret = config.jwt.access_token || process.env.JWT_ACCESS_TOKEN;
  const payload = {
    _id: userId,
    role: 'user',
    tenants: [{ tenantId: '6a278229332d955a872ec0f0', role: 'admin' }]
  };
  
  const token = jwt.sign(payload, tokenSecret, { expiresIn: '1h' });
  console.log('Generated JWT token:', token);

  // Call the live API
  console.log('\n--- Calling live GET /conversations/:conversationId ---');
  const res = await fetch(`${backendUrl}/conversations/${conv.conversationId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`Response Status: ${res.status}`);
  const json = await res.json();
  console.log('API Response data:', JSON.stringify(json, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error('Error:', e);
  await mongoose.disconnect();
  process.exit(1);
});
