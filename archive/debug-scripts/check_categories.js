import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const uri = process.env.DATABASE_LOCAL;

async function main() {
  if (!uri) {
    console.error('DATABASE_LOCAL is not defined in .env');
    return;
  }
  console.log('Connecting to database...');
  try {
    await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 10000 });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Get categories of conversations
    const aggregation = await db.collection('conversations').aggregate([
      {
        $group: {
          _id: '$metadata.category',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log('\nConversation counts by metadata.category:');
    console.log(JSON.stringify(aggregation, null, 2));

    // Get count of is_deep_search
    const deepSearchCount = await db.collection('conversations').countDocuments({ is_deep_search: true });
    console.log(`\nConversations with is_deep_search: true: ${deepSearchCount}`);

    // Print a few sample conversations to see their structure
    console.log('\nSample conversations:');
    const samples = await db.collection('conversations').find({}).limit(5).project({
      conversationId: 1,
      title: 1,
      'metadata.category': 1,
      is_deep_search: 1,
      createdAt: 1
    }).toArray();
    console.log(JSON.stringify(samples, null, 2));

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
