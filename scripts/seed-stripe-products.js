import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import config from '../config/index.js';
import Product from '../src/app/modules/stripe/products/products.model.js';

async function main() {
  const file = path.join(process.cwd(), 'config', 'stripe-products.json');
  if (!fs.existsSync(file)) {
    console.error('stripe-products.json not found');
    process.exit(1);
  }

  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const plans = data.plans || [];

  let mongoUrl = config.database_local || process.env.DATABASE_LOCAL;
  if (!mongoUrl) {
    // Fallback to local MongoDB for developer convenience
    mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/inso';
    console.warn('DATABASE_LOCAL not set; falling back to', mongoUrl);
  }

  await mongoose.connect(mongoUrl, {
    dbName: process.env.MONGO_DB_NAME || undefined,
  });
  console.log('Connected to MongoDB');

  for (const p of plans) {
    const features = p.features || {};
    const dailyRequestLimit =
      features.dailyRequestLimit ||
      Math.max(0, Math.ceil((features.searchLimit || 0) / 30));

    const doc = {
      plan: p.plan,
      name: p.name || p.plan,
      displayName: p.name || p.plan,
      description: p.description || '',
      price: p.price || 0,
      currency: p.currency || 'usd',
      interval: p.interval || 'month',
      stripeProductId: p.productId || p.stripeProductId || `prod_${p.plan}`,
      stripePriceId: p.priceId || p.stripePriceId || `price_${p.plan}`,
      features: {
        dailyRequestLimit,
        ragType: features.ragType || 'none',
        storagePerUser: features.storagePerUser || 0,
        canInviteTeam: features.canInviteTeam || false,
        researchLimit: features.researchLimit || 0,
        imageLimit: features.imageLimit || 0,
        videoLimit: features.videoLimit || 0,
        taskLimit: features.taskLimit || 0,
        workflowLimit: features.workflowLimit || 0,
        searchLimit: features.searchLimit || 0,
        writeLimit: features.writeLimit || 0,
        codeLimit: features.codeLimit || 0,
        projectsLimit: features.projectsLimit || 0,
        modelsLimit: features.modelsLimit || 0,
        knowledgeLimit: features.knowledgeLimit || features.storagePerUser || 0,
        monitorLimit: features.monitorLimit || 0,
      },
      featuresList: p.featuresList || [],
      metadata: p.metadata || {},
      isActive: p.isActive !== false,
      isVisible: p.isVisible !== false,
    };

    // Upsert by stripeProductId
    try {
      await Product.updateOne(
        { stripeProductId: doc.stripeProductId },
        { $set: doc },
        { upsert: true }
      );
      console.log(`Upserted product ${doc.plan} (${doc.stripeProductId})`);
    } catch (err) {
      console.error('Failed to upsert product', doc.plan, err.message);
    }
  }

  console.log('Seeding complete');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
