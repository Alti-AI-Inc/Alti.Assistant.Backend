import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from './src/app/modules/notification/notification.model.js';

dotenv.config();

async function run() {
  const dbUrl = process.env.DATABASE_LOCAL;
  console.log('Connecting to database:', dbUrl);
  
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4,
    });
    console.log('Connected to database successfully!');
    
    const count = await Notification.countDocuments({});
    console.log(`Total notifications in Notification collection: ${count}`);
    
    if (count > 0) {
      const sample = await Notification.find({}).limit(5);
      console.log('Sample notifications:');
      sample.forEach((notif, index) => {
        console.log(`[${index}] ID: ${notif._id}, Title: "${notif.title}", Category: "${notif.category}", UserID: ${notif.userId}, isArchived: ${notif.isArchived}, isRead: ${notif.isRead}`);
        console.log(`   Payload keys: ${notif.payload ? Array.from(notif.payload.keys()).join(', ') : 'None'}`);
      });
    }
  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
