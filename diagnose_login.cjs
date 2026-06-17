const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PASSWORD = 'Victory$23';
const EMAIL = 'meram.michael@gmail.com';
const MONGO_URI = 'mongodb://ason-db-username:6TKXGrFEjBWWqcHU@ac-2vdm3ae-shard-00-00.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-01.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-02.piwgo1l.mongodb.net:27017/ASON?ssl=true&replicaSet=atlas-sflo2l-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
  console.log('=== FULL LOGIN DIAGNOSTIC ===\n');

  // Step 1: Connect to DB
  await mongoose.connect(MONGO_URI);
  console.log('[1] Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // Step 2: Find the user
  const user = await db.collection('users').findOne({ email: EMAIL });
  if (!user) {
    console.log('[FATAL] User not found with email:', EMAIL);
    process.exit(1);
  }
  console.log('[2] User found:');
  console.log('    _id:', user._id.toString());
  console.log('    email:', user.email);
  console.log('    role:', user.role);
  console.log('    has password field:', !!user.password);
  console.log('    password hash:', user.password);
  console.log('');

  // Step 3: Test bcrypt compare with the EXACT password
  console.log('[3] Testing bcrypt.compare("' + PASSWORD + '", hash)...');
  const match = await bcrypt.compare(PASSWORD, user.password);
  console.log('    Result:', match);
  console.log('');

  if (!match) {
    console.log('[PROBLEM] Password does NOT match the stored hash!');
    console.log('');

    // Step 4: Generate a CORRECT hash and update the DB
    console.log('[4] Generating correct hash for "' + PASSWORD + '"...');
    const correctHash = await bcrypt.hash(PASSWORD, 12);
    console.log('    New hash:', correctHash);

    // Verify the new hash works
    const verify = await bcrypt.compare(PASSWORD, correctHash);
    console.log('    Verification of new hash:', verify);

    if (verify) {
      // Update the database
      const result = await db.collection('users').updateOne(
        { email: EMAIL },
        { $set: { password: correctHash } }
      );
      console.log('    DB update result:', result.modifiedCount, 'document(s) modified');

      // Final verification - re-read from DB
      const updatedUser = await db.collection('users').findOne({ email: EMAIL });
      const finalCheck = await bcrypt.compare(PASSWORD, updatedUser.password);
      console.log('');
      console.log('[5] FINAL VERIFICATION after DB update:');
      console.log('    New hash in DB:', updatedUser.password);
      console.log('    bcrypt.compare("' + PASSWORD + '", newHash):', finalCheck);

      if (finalCheck) {
        console.log('');
        console.log('=== SUCCESS: Password has been fixed! Login should work now. ===');
      } else {
        console.log('');
        console.log('=== CRITICAL ERROR: Even the newly generated hash does not match! ===');
      }
    }
  } else {
    console.log('[OK] Password matches! The problem is NOT the password hash.');
    console.log('     The issue must be elsewhere (middleware, request parsing, etc.).');
  }

  process.exit(0);
}

run().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
