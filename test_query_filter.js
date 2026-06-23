import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.DATABASE_LOCAL;

async function main() {
  if (!uri) {
    console.error('DATABASE_LOCAL is not defined in .env');
    return;
  }
  try {
    await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Simulate query for category = 'code'
    const codeQuery = { 'metadata.category': 'code' };
    const codeResults = await db.collection('conversations').find(codeQuery).project({ title: 1, 'metadata.category': 1 }).toArray();
    console.log(`\nQuery: { 'metadata.category': 'code' } -> Found ${codeResults.length} conversations`);
    console.log(codeResults.slice(0, 5));

    // Simulate query for category = 'image,image_generation,image_editing'
    const imageCategory = 'image,image_generation,image_editing,image_intent_analysis';
    const imageQuery = { 'metadata.category': { $in: imageCategory.split(',') } };
    const imageResults = await db.collection('conversations').find(imageQuery).project({ title: 1, 'metadata.category': 1 }).toArray();
    console.log(`\nQuery: { 'metadata.category': { $in: [...] } } -> Found ${imageResults.length} conversations`);
    console.log(imageResults.slice(0, 5));

    // Simulate query for category = null/undefined (what gets returned for Chats)
    const allCount = await db.collection('conversations').countDocuments({});
    console.log(`\nTotal conversations in DB: ${allCount}`);

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
