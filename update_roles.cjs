const { MongoClient } = require('mongodb');

const uri = "mongodb://ason-db-username:6TKXGrFEjBWWqcHU@ac-2vdm3ae-shard-00-00.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-01.piwgo1l.mongodb.net:27017,ac-2vdm3ae-shard-00-02.piwgo1l.mongodb.net:27017/ASON?ssl=true&replicaSet=atlas-sflo2l-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('ASON');
    
    const meram = await db.collection('users').findOne({ email: 'meram.michael@gmail.com' });
    console.log("Before update meram:", meram?.role);
    
    await db.collection('users').updateOne(
      { email: 'meram.michael@gmail.com' },
      { $set: { role: 'admin' } }
    );
    
    const meramAfter = await db.collection('users').findOne({ email: 'meram.michael@gmail.com' });
    console.log("After update meram:", meramAfter?.role);

    const adminUser = await db.collection('users').findOne({ email: 'admin@altihq.com' });
    console.log("Before update admin:", adminUser?.role);
    
    await db.collection('users').updateOne(
      { email: 'admin@altihq.com' },
      { $set: { role: 'super_admin' } }
    );

    const adminAfter = await db.collection('users').findOne({ email: 'admin@altihq.com' });
    console.log("After update admin:", adminAfter?.role);
    
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
