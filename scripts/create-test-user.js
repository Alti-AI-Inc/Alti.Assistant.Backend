import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import UserModel from '../src/app/modules/auth/auth.model.js';

mongoose.connect(config.database_local).then(async () => {
  const email = 'testlocal@altihq.com';
  const password = 'Password123!';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await UserModel.deleteOne({ email });
  await UserModel.create({
    email,
    password: hashedPassword,
    role: 'user',
    isVerified: true
  });
  console.log(`Created test user: ${email} / ${password}`);
  process.exit(0);
}).catch(console.error);
