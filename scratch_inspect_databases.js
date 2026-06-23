import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set DNS servers:', e);
}
import mongoose from 'mongoose';

const dbUri = 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/?retryWrites=true&w=majority';

console.log('Connecting to Atlas to list databases...');

mongoose.connect(dbUri)
  .then(async () => {
    console.log('Connected successfully!');
    const adminDb = mongoose.connection.db.admin();
    const dbsInfo = await adminDb.listDatabases();
    console.log('Databases list:');
    for (const dbInfo of dbsInfo.databases) {
      console.log(`- ${dbInfo.name} (size: ${dbInfo.sizeOnDisk} bytes)`);
      // Connect to each database to list collections
      const db = mongoose.connection.client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      console.log(`  Collections: ${collections.map(c => c.name).join(', ')}`);
    }
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed:', err);
    process.exit(1);
  });
