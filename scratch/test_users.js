import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserModel from './src/app/modules/auth/auth.model.js';

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
    
    const users = await UserModel.find({}, 'email username name tenantId notifications');
    console.log(`Found ${users.length} users in the database:`);
    users.forEach(user => {
      console.log(`- ID: ${user._id}, Email: ${user.email}, Name: ${user.name || 'N/A'}, Tenant: ${user.tenantId || 'None'}, Notifs Count: ${user.notifications ? user.notifications.length : 0}`);
    });
    
  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
