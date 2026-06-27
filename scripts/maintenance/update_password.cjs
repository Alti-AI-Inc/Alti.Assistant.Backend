const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  await mongoose.connect('mongodb://ason-db-username:6TKXGrFEjBWWqcHU@ac-2vdm3ae-shard-00-00.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-01.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-02.piwgo1l.mongodb.net:27017/ASON?ssl=true&replicaSet=atlas-sflo2l-shard-0&authSource=admin&retryWrites=true&w=majority');
  const db = mongoose.connection.db;
  const password = 'Victory$23';
  const hash = await bcrypt.hash(password, 12);
  await db.collection('users').updateOne({ email: 'meram.michael@gmail.com' }, { $set: { password: hash } });
  console.log('Password updated successfully with Victory$23');
  process.exit(0);
}
run();
