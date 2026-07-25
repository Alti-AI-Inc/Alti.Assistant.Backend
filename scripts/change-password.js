import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import UserModel from '../src/app/modules/auth/auth.model.js';
import config from '../config/index.js';

// Load environment variables
dotenv.config();

async function changePassword() {
  const args = process.argv.slice(2);
  const email = args[0];
  const newPassword = args[1];

  if (!email || !newPassword) {
    console.error('Usage: node scripts/change-password.js <email> <new_password>');
    process.exit(1);
  }

  try {
    const dbUri = config.database_local || process.env.DATABASE_LOCAL || 'mongodb://localhost:27017/inso-assistant';
    console.log('Connecting to database...');
    await mongoose.connect(dbUri);
    console.log('Connected.');

    const emailLower = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: emailLower });

    if (!user) {
      console.error(`Error: User with email "${emailLower}" not found in database.`);
      process.exit(1);
    }

    console.log(`User found: ${user.email} (ID: ${user._id})`);
    
    // Hash new password using bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    user.password = hashedPassword;
    await user.save({ validateBeforeSave: false });
    
    console.log(`Password for user "${emailLower}" updated successfully!`);
  } catch (error) {
    console.error('Error changing password:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  }
}

changePassword();
