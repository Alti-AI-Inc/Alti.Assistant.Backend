import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set DNS servers:', e);
}

import mongoose from 'mongoose';

const dbUri = 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

console.log('Connecting to:', dbUri);

mongoose.connect(dbUri, {
  serverSelectionTimeoutMS: 15000,
})
.then(() => {
  console.log('Connected successfully!');
  process.exit(0);
})
.catch((err) => {
  console.error('Connection failed:', err);
  process.exit(1);
});
