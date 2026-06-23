import mongoose from 'mongoose';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import config from './config/index.js';
import Conversation from './src/app/modules/conversations/conversation.model.js';

dotenv.config();

const dbUri = config.database_local || process.env.DATABASE_LOCAL;
const backendUrl = 'https://alti-assistant-backend-859038385070.us-central1.run.app/api/v1';

async function run() {
  console.log('--- STARTING E2E ENCRYPTION DECRYPTION AUDIT ---');
  console.log('Connecting to database:', dbUri);

  await mongoose.connect(dbUri);
  console.log('Connected to MongoDB.');

  const email = `audit_user_${Date.now()}@example.com`;
  const password = 'AuditPassword123!';

  console.log(`\n1. Registering user: ${email}...`);
  const regRes = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, confirmPassword: password })
  });
  const regJson = await regRes.json();
  console.log('Registration Response:', regJson);

  // Retrieve verification token from MongoDB
  const TokenSchema = new mongoose.Schema({}, { strict: false });
  const TokenModel = mongoose.model('Token', TokenSchema, 'tokens');
  
  const UserSchema = new mongoose.Schema({}, { strict: false });
  const UserModel = mongoose.model('User', UserSchema, 'users');

  const userRecord = await UserModel.findOne({ email });
  if (!userRecord) {
    throw new Error('User not found in DB after registration!');
  }
  console.log(`Found registered user ID: ${userRecord._id}`);

  const tokenRecord = await TokenModel.findOne({ userId: userRecord._id });
  if (!tokenRecord) {
    throw new Error('Verification OTP token not found in DB!');
  }
  const otp = tokenRecord.get('token');
  console.log(`Retrieved OTP token from DB: ${otp}`);

  console.log('\n2. Confirming email verification...');
  const verifyRes = await fetch(`${backendUrl}/auth/register/confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: otp })
  });
  console.log('Email Confirmation Response:', await verifyRes.json());

  console.log('\n3. Logging in to obtain access token...');
  const loginRes = await fetch(`${backendUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginJson = await loginRes.json();
  console.log('Login Response:', loginJson);
  const token = loginJson.data.accessToken;
  console.log('Successfully acquired JWT access token.');

  const tenantId = loginJson.data.tenants[0].tenantId;

  console.log('\n4. Creating a conversation with initial message...');
  const chatMsg = 'Hello, this is a plaintext query to the assistant!';
  const createChatRes = await fetch(`${backendUrl}/conversations`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId
    },
    body: JSON.stringify({
      title: 'E2E Decryption Test Chat',
      initialMessage: {
        role: 'user',
        content: chatMsg
      }
    })
  });
  const chatJson = await createChatRes.json();
  console.log('Chat Creation Response:', chatJson);
  const conversationId = chatJson.data.conversationId;
  console.log(`Conversation ID: ${conversationId}`);

  console.log('\n5. Fetching conversation details via GET /conversations/:conversationId...');
  const getChatRes = await fetch(`${backendUrl}/conversations/${conversationId}`, {
    method: 'GET',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId
    }
  });
  const getChatJson = await getChatRes.json();
  console.log('GET /conversations Response:', JSON.stringify(getChatJson, null, 2));

  console.log('\n6. Fetching user conversations list via GET /conversations...');
  const listChatRes = await fetch(`${backendUrl}/conversations?limit=5`, {
    method: 'GET',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId
    }
  });
  const listChatJson = await listChatRes.json();
  console.log('GET /conversations List Response:', JSON.stringify(listChatJson, null, 2));

  // Clean up
  console.log('\nCleaning up database...');
  await Conversation.deleteOne({ conversationId });
  await UserModel.deleteOne({ _id: userRecord._id });
  await TokenModel.deleteOne({ userId: userRecord._id });
  console.log('Cleanup complete.');

  await mongoose.disconnect();
  console.log('\n--- AUDIT COMPLETE ---');
  process.exit(0);
}

run().catch(async (e) => {
  console.error('Audit Error:', e);
  await mongoose.disconnect();
  process.exit(1);
});
