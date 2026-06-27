import mongoose from 'mongoose';
import fetch from 'node-fetch';

const dbUri = 'mongodb://127.0.0.1:27017/Alti';
const backendUrl = 'http://127.0.0.1:5100/api/v1';

async function run() {
  console.log('--- STARTING E2E ZERO-TRUST ENCRYPTION AUDIT ---');

  // Connect to DB directly for audit verification
  await mongoose.connect(dbUri);
  console.log('Connected to MongoDB local database.');

  const email = `audit_user_${Date.now()}@example.com`;
  const password = 'AuditPassword123!';

  console.log(`\n1. Registering user: ${email}...`);
  const regRes = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
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
  console.log('Login Response Status:', loginRes.status);
  const token = loginJson.data.accessToken;
  console.log('Successfully acquired JWT access token.');

  console.log('\n4. Creating conversation and sending test message...');
  const chatMsg = 'Zero-Trust Encryption Secret: This is a highly confidential enterprise plan!';
  const createChatRes = await fetch(`${backendUrl}/conversations`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: chatMsg }],
      title: 'Enterprise Encryption Audit Chat'
    })
  });
  const chatJson = await createChatRes.json();
  console.log('Chat Creation API Response:', chatJson);
  const conversationId = chatJson.data._id;
  console.log(`Conversation ID: ${conversationId}`);

  console.log('\n5. Performing Database Audit: Verifying Encrypted Storage...');
  // Read raw MongoDB document directly to bypass Mongoose model getters!
  const rawDbDocs = await mongoose.connection.db.collection('conversations').find({ _id: new mongoose.Types.ObjectId(conversationId) }).toArray();
  const rawDoc = rawDbDocs[0];
  console.log('RAW DOCUMENT FROM MONGO DB (Ciphertext):');
  console.log('Raw Title Field in DB:', rawDoc.title);
  console.log('Raw Message Content Field in DB:', JSON.stringify(rawDoc.content));

  const isTitleEncrypted = !rawDoc.title.includes('Enterprise');
  const isMessageEncrypted = !JSON.stringify(rawDoc.content).includes('Zero-Trust');
  
  if (isTitleEncrypted && isMessageEncrypted) {
    console.log('\n✅ ENCRYPTION SUCCESSFUL! Data is stored as raw encrypted ciphertext in MongoDB.');
  } else {
    console.log('\n❌ ENCRYPTION FAILED! Data is stored as plaintext in MongoDB.');
  }

  console.log('\n6. Performing API Audit: Verifying Decrypted Delivery...');
  const fetchChatRes = await fetch(`${backendUrl}/conversations/${conversationId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const fetchChatJson = await fetchChatRes.json();
  console.log('Decrypted API Response title:', fetchChatJson.data.title);
  console.log('Decrypted API Response message content:', JSON.stringify(fetchChatJson.data.content));

  const isTitleDecrypted = fetchChatJson.data.title.includes('Enterprise');
  if (isTitleDecrypted) {
    console.log('\n✅ DECRYPTION SUCCESSFUL! Transparent Mongoose getters auto-decrypted response.');
  } else {
    console.log('\n❌ DECRYPTION FAILED!');
  }

  console.log('\n--- E2E ZERO-TRUST ENCRYPTION AUDIT COMPLETE ---');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error('Audit Error:', e);
  await mongoose.disconnect();
  process.exit(1);
});
