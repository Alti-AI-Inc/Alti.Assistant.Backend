import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { NotificationService } from './src/app/modules/notification/notification.service.js';

dotenv.config();

async function run() {
  const dbUrl = process.env.DATABASE_LOCAL;
  console.log('Connecting to database:', dbUrl);
  
  try {
    mongoose.set('debug', true);
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4,
    });
    console.log('Connected to database successfully!');
    
    // Sample user: admin@altihq.com with ID 6a0eb8424c38f54604563ccd
    const userId = '6a0eb8424c38f54604563ccd';
    console.log(`Querying inbox items for user: ${userId}`);
    
    // Check direct query count in Notification collection
    const directCount = await mongoose.connection.db.collection('notifications').countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    console.log(`Direct MongoDB count for user: ${directCount}`);
    
    if (directCount > 0) {
      const directDocs = await mongoose.connection.db.collection('notifications').find({ userId: new mongoose.Types.ObjectId(userId) }).toArray();
      console.log('Direct docs keys and properties:');
      directDocs.forEach((doc, idx) => {
        console.log(`[${idx}] ID: ${doc._id}, Title: "${doc.title}", isArchived: ${doc.isArchived} (type: ${typeof doc.isArchived}), isArchived in doc: ${'isArchived' in doc}`);
      });
    }
    
    // Simulate fetching unarchived inbox items
    const objUserId = new mongoose.Types.ObjectId(userId);
    const inboxItems = await NotificationService.getUserInboxService(objUserId, undefined, false);
    
    console.log(`Retrieved ${inboxItems.length} unarchived inbox items for this user:`);
    inboxItems.forEach((item, index) => {
      console.log(`[${index}] ID: ${item._id}, Title: "${item.title}", isArchived: ${item.isArchived}`);
    });
    
    if (inboxItems.length === 4) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: 4 rich notifications successfully returned for the user!');
    } else {
      console.log('\n❌ VERIFICATION FAILURE: Expected 4 notifications but found ' + inboxItems.length);
    }
  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
