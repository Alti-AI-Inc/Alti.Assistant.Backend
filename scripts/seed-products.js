import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ProductModel from '../src/app/modules/products/products.model.js';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Seed Products from stripe-products.json
 */

// Parse command line arguments
const args = process.argv.slice(2);
const forceUpdate = args.includes('--force');

// Feature descriptions for each plan
const FEATURES_LIST = {
  free: [
    '10 web searches per day',
    'No deep research',
    'Single user only',
    'Basic support',
  ],
  explore: [
    '1,000 web searches per day',
    '10 deep research queries per day',
    'Unlimited team members',
    '$20 per user per month',
    'Email support',
  ],
  execute: [
    '5,000 web searches per day',
    '50 deep research queries per day',
    'Unlimited team members',
    '$50 per user per month',
    'Priority email support',
    'Advanced analytics',
  ],
  command: [
    '15,000 web searches per day',
    '150 deep research queries per day',
    'Unlimited team members',
    '$100 per user per month',
    'Priority support with dedicated account manager',
    'Advanced analytics',
    'Custom integrations',
  ],
};

const DESCRIPTIONS = {
  free: 'Perfect for trying out Alti Assistant with basic features',
  explore: 'Great for individuals and small teams getting started',
  execute: 'Ideal for growing teams with regular usage needs',
  command: 'Best for large teams with high-volume requirements',
};

const SORT_ORDER = {
  free: 0,
  explore: 1,
  execute: 2,
  command: 3,
};

async function seedProducts() {
  try {
    console.log('🌱 Starting product seeding...\n');

    // Connect to MongoDB
    const mongoUri = config.database_local || process.env.DATABASE_LOCAL;
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found in config or .env');
      console.error('Please set DATABASE_LOCAL in your .env file\n');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Load stripe-products.json
    const stripeProductsPath = join(
      __dirname,
      '..',
      'config',
      'stripe-products.json'
    );
    let stripeProducts;

    try {
      const fileContent = readFileSync(stripeProductsPath, 'utf8');
      stripeProducts = JSON.parse(fileContent);
    } catch (error) {
      console.error('❌ Error loading stripe-products.json:', error.message);
      console.error('Please run: npm run seed:stripe\n');
      process.exit(1);
    }

    console.log(
      `📦 Found ${stripeProducts.plans.length} plans in stripe-products.json\n`
    );

    // Check for existing products
    const existingCount = await ProductModel.countDocuments();
    if (existingCount > 0 && !forceUpdate) {
      console.log(`⚠️  Found ${existingCount} existing products in database`);
      console.log('Use --force flag to update existing products\n');
      console.log('Example: npm run seed:products -- --force\n');
      process.exit(0);
    }

    if (forceUpdate && existingCount > 0) {
      console.log(
        `🗑️  Force mode: Deleting ${existingCount} existing products...\n`
      );
      await ProductModel.deleteMany({});
    }

    // Seed products
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const planData of stripeProducts.plans) {
      try {
        const productData = {
          plan: planData.plan,
          name: planData.name,
          displayName: planData.name,
          description: DESCRIPTIONS[planData.plan] || '',
          price: planData.price,
          currency: planData.currency,
          interval: planData.interval,
          stripeProductId: planData.productId,
          stripePriceId: planData.priceId,
          features: {
            dailyWebSearchLimit: planData.features.dailyWebSearchLimit,
            dailyDeepResearchLimit: planData.features.dailyDeepResearchLimit,
            canInviteTeam: planData.features.canInviteTeam,
            unlimitedSeats: planData.features.unlimitedSeats,
          },
          featuresList: FEATURES_LIST[planData.plan] || [],
          isActive: true,
          isVisible: true,
          sortOrder: SORT_ORDER[planData.plan] || 999,
        };

        // Upsert product (update if exists, insert if not)
        const result = await ProductModel.findOneAndUpdate(
          { plan: planData.plan },
          productData,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (result) {
          const isNew = !existingCount || forceUpdate;
          if (isNew) {
            created++;
            console.log(`✅ Created: ${planData.name} (${planData.plan})`);
          } else {
            updated++;
            console.log(`🔄 Updated: ${planData.name} (${planData.plan})`);
          }
          console.log(`   Price: $${planData.price}/${planData.interval}`);
          console.log(`   Product ID: ${planData.productId}`);
          console.log(`   Price ID: ${planData.priceId}`);
          console.log(
            `   Features: ${productData.featuresList.length} listed\n`
          );
        }
      } catch (error) {
        failed++;
        console.error(`❌ Failed to seed ${planData.name}:`, error.message);
        console.error(error.stack);
      }
    }

    // Summary
    console.log('\n📊 Seeding Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📦 Total: ${created + updated}\n`);

    // Verify all products
    const allProducts = await ProductModel.find().sort({ sortOrder: 1 });
    console.log('📋 Products in database:');
    allProducts.forEach((product) => {
      console.log(
        `   ${product.sortOrder + 1}. ${product.name} - $${product.price}/${product.interval}`
      );
    });

    console.log('\n✅ Product seeding completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB\n');
    }
  }
}

// Run seeder
seedProducts();
