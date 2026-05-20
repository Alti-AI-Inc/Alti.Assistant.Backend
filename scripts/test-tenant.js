import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), 'env') });

const mongoUri = process.env.DATABASE_LOCAL || 'mongodb+srv://ason-db-username:2kep7suGSMneEHq8@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB successfully!');

  // Define simple schemas inline for querying
  const UserSchema = new mongoose.Schema({}, { strict: false });
  const UserModel = mongoose.models.User || mongoose.model('User', UserSchema, 'users');

  const TenantSchema = new mongoose.Schema({}, { strict: false });
  const TenantModel = mongoose.models.Tenant || mongoose.model('Tenant', TenantSchema, 'tenants');

  const TenantMemberSchema = new mongoose.Schema({}, { strict: false });
  const TenantMemberModel = mongoose.models.TenantMember || mongoose.model('TenantMember', TenantMemberSchema, 'tenantmembers');

  const SubscriptionSchema = new mongoose.Schema({}, { strict: false });
  const SubscriptionModel = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema, 'subscriptions');

  // Let's list all users
  const users = await UserModel.find({}).limit(10).lean();
  console.log('--- USERS (LIMIT 10) ---');
  for (const u of users) {
    console.log(`ID: ${u._id}, Email: ${u.email}, activeTenantId: ${u.activeTenantId}`);
  }

  // Let's list all tenants
  const tenants = await TenantModel.find({}).lean();
  console.log('--- TENANTS ---');
  for (const t of tenants) {
    console.log(`ID: ${t._id}, Name: ${t.name}, Slug: ${t.slug}, Subdomain: ${t.subdomain}`);
  }

  // Let's list all memberships
  const memberships = await TenantMemberModel.find({}).lean();
  console.log('--- TENANT MEMBERSHIPS ---');
  for (const m of memberships) {
    console.log(`ID: ${m._id}, TenantId: ${m.tenantId}, UserId: ${m.userId}, Role: ${m.role}, Status: ${m.status}`);
  }

  // Let's test getTenantById logic for each tenant
  console.log('--- TESTING SUBSCRIPTION AGGREGATION FOR ALL TENANTS ---');
  for (const t of tenants) {
    try {
      const tenantId = t._id.toString();
      const subscription = await SubscriptionModel.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        {
          $lookup: {
            from: 'products',
            localField: 'price',
            foreignField: 'stripePriceId',
            as: 'price',
          },
        },
        { $unwind: '$price' },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
      ]);
      console.log(`Tenant ${t.name} (${tenantId}) aggregate result:`, subscription);
    } catch (err) {
      console.error(`Tenant ${t.name} (${t._id}) aggregate FAILED:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch(console.error);
