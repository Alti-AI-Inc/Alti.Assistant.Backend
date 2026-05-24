import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const schema = new mongoose.Schema({
  app: String,
  authConfigId: String,
  authSchema: String,
  isComposioManaged: Boolean
}, { collection: 'authconfigs' });

const AuthConfig = mongoose.model('AuthConfig', schema);

const uri = process.env.DATABASE_LOCAL || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

async function run() {
  try {
    console.log('Connecting to database:', uri.replace(/:([^:@]+)@/, ':****@'));
    await mongoose.connect(uri, { family: 4 });
    console.log('Connected!');

    const count = await AuthConfig.countDocuments();
    console.log('Total AuthConfigs in DB:', count);

    const samples = await AuthConfig.find().limit(10);
    console.log('Sample AuthConfigs:', JSON.stringify(samples, null, 2));

    await mongoose.connection.close();
    console.log('Database connection closed.');
  } catch (err) {
    console.error('Error querying DB:', err);
  }
}

run();
