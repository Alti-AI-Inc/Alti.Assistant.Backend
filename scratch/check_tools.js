import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.DATABASE_LOCAL;
const ToolSchema = new mongoose.Schema({}, { strict: false });
const Tool = mongoose.model('Tool', ToolSchema);

async function run() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB.');
    
    const totalTools = await Tool.countDocuments({});
    console.log('Total tools in DB:', totalTools);
    
    const distinctApps = await Tool.distinct('appName');
    console.log('Total distinct appNames in DB:', distinctApps.length);
    
    const sampleApps = distinctApps.slice(0, 20);
    console.log('Sample appNames in DB:', sampleApps);
    
    const procoreTools = await Tool.countDocuments({ appName: 'procore' });
    console.log('Procore tools count:', procoreTools);
    
    const procoreSlugTools = await Tool.countDocuments({ slug: { $regex: 'procore', $options: 'i' } });
    console.log('Procore regex slug tools count:', procoreSlugTools);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
