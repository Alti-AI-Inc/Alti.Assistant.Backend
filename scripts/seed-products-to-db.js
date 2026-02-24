import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Import Product model
import Product from '../src/app/modules/stripe/products/products.model.js';

/**
 * Load products from stripe-products.json config
 */
function loadProductsFromConfig() {
  const configPath = path.join(process.cwd(), 'config', 'stripe-products.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Please run 'npm run seed:stripe' first.`);
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config.plans;
}

/**
 * Seed products into MongoDB
 */
async function seedProductsToDatabase() {
  try {
    console.log('🚀 Starting Product Database Seeder...\n');
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.DATABASE_LOCAL, { family: 4 });
    console.log('✅ Connected to MongoDB\n');
    
    // Load products from config
    console.log('📄 Loading products from config...');
    const plans = loadProductsFromConfig();
    console.log(`✅ Loaded ${plans.length} plans\n`);
    
    // Clear existing products
    console.log('🗑️  Clearing existing products...');
    const deleteResult = await Product.deleteMany({});
    console.log(`✅ Removed ${deleteResult.deletedCount} existing products\n`);
    
    // Define sort order for plans
    const sortOrderMap = {
      'free': 0,
      'explore': 1,
      'execute': 2,
      'command': 3,
    };
    
    // Transform and insert products
    console.log('💾 Inserting products into database...\n');
    const productsToInsert = plans.map((plan) => ({
      plan: plan.plan,
      name: plan.name,
      displayName: plan.name,
      description: plan.description || `${plan.name} plan with advanced features`,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      stripeProductId: plan.productId,
      stripePriceId: plan.priceId,
      features: {
        dailyRequestLimit: plan.features.dailyRequestLimit,
        ragType: plan.features.ragType,
        storagePerUser: plan.features.storagePerUser,
        canInviteTeam: plan.features.canInviteTeam,
      },
      featuresList: plan.featuresList || [],
      metadata: plan.metadata || {},
      isActive: true,
      isVisible: plan.plan !== 'free', // Hide free plan from pricing page
      sortOrder: sortOrderMap[plan.plan] || 999,
    }));
    
    const insertedProducts = await Product.insertMany(productsToInsert);
    console.log(`✅ Successfully inserted ${insertedProducts.length} products\n`);
    
    // Print summary
    console.log('='.repeat(60));
    console.log('📊 PRODUCTS IN DATABASE');
    console.log('='.repeat(60));
    console.log('');
    
    for (const product of insertedProducts) {
      console.log(`✨ ${product.name} (${product.plan})`);
      console.log(`   Price: $${product.price}/${product.interval}`);
      console.log(`   Features:`);
      console.log(`     • ${product.features.dailyRequestLimit} requests/day`);
      console.log(`     • RAG: ${product.features.ragType}`);
      console.log(`     • Storage: ${(product.features.storagePerUser / 1073741824).toFixed(0)}GB/user`);
      console.log(`     • Team Invites: ${product.features.canInviteTeam ? 'Yes' : 'No'}`);
      console.log(`   Stripe Product ID: ${product.stripeProductId}`);
      console.log(`   Stripe Price ID: ${product.stripePriceId}`);
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('✅ DATABASE SEEDING COMPLETED!');
    console.log('='.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Verify products in your database');
    console.log('   2. Test GET /api/v1/stripe/products endpoint');
    console.log('   3. Update subscription model with new features');
    console.log('   4. Create limit enforcement middleware\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run seeder
seedProductsToDatabase();
