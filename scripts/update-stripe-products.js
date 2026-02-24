import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Import Product model
import Product from '../src/app/modules/stripe/products/products.model.js';

/**
 * Updated Plans Configuration
 */
const UPDATED_PLANS = [
  {
    plan: 'free',
    name: 'Free Trial',
    description: '10 requests/day - No Team Collaboration',
    features: {
      dailyRequestLimit: 10,
      ragType: 'none',
      storagePerUser: 0,
      canInviteTeam: false,
    },
    featuresList: [
      '10 requests/day',
      'No Team Collaboration',
      'No document storage',
      'Basic support'
    ],
    metadata: {
      plan: 'free',
      canInviteTeam: 'false',
      ragType: 'none',
      storagePerUserGB: '0',
    },
  },
  {
    plan: 'explore',
    name: 'Explore',
    description: 'Basic Text Document RAG (10GB/user) - Invite Your Team',
    features: {
      dailyRequestLimit: 1000,
      ragType: 'basic_text',
      storagePerUser: 10737418240, // 10GB in bytes
      canInviteTeam: true,
    },
    featuresList: [
      '1,000 requests/day',
      'Basic Text Document RAG',
      '10GB storage per user',
      'Invite Your Team',
      'Email support'
    ],
    metadata: {
      plan: 'explore',
      canInviteTeam: 'true',
      ragType: 'basic_text',
      storagePerUserGB: '10',
    },
  },
  {
    plan: 'execute',
    name: 'Execute',
    description: 'Advanced Multi-Modal RAG (50GB/user) - Invite Your Team',
    features: {
      dailyRequestLimit: 5000,
      ragType: 'advanced_multimodal',
      storagePerUser: 53687091200, // 50GB in bytes
      canInviteTeam: true,
    },
    featuresList: [
      '5,000 requests/day',
      'Advanced Multi-Modal RAG',
      '50GB storage per user',
      'Invite Your Team',
      'Priority email support',
      'Advanced analytics'
    ],
    metadata: {
      plan: 'execute',
      canInviteTeam: 'true',
      ragType: 'advanced_multimodal',
      storagePerUserGB: '50',
    },
  },
  {
    plan: 'command',
    name: 'Command',
    description: 'Premium Agentic RAG (100GB/user) - Invite Your Team',
    features: {
      dailyRequestLimit: 15000,
      ragType: 'premium_agentic',
      storagePerUser: 107374182400, // 100GB in bytes
      canInviteTeam: true,
    },
    featuresList: [
      '15,000 requests/day',
      'Premium Agentic RAG',
      '100GB storage per user',
      'Invite Your Team',
      'Priority support with dedicated account manager',
      'Advanced analytics',
      'Custom integrations'
    ],
    metadata: {
      plan: 'command',
      canInviteTeam: 'true',
      ragType: 'premium_agentic',
      storagePerUserGB: '100',
    },
  },
];

/**
 * Load existing product IDs from config
 */
function loadExistingProducts() {
  const configPath = path.join(process.cwd(), 'config', 'stripe-products.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Products must exist before updating.`);
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config.plans;
}

/**
 * Update Stripe Product
 */
async function updateStripeProduct(productId, planData) {
  try {
    console.log(`\n📦 Updating Stripe product: ${planData.name}...`);
    
    const updatedProduct = await stripe.products.update(productId, {
      name: planData.name,
      description: planData.description,
      metadata: planData.metadata,
    });
    
    console.log(`✅ Stripe product updated: ${updatedProduct.id}`);
    return updatedProduct;
  } catch (error) {
    console.error(`❌ Error updating Stripe product ${productId}:`, error.message);
    throw error;
  }
}

/**
 * Update Stripe Price (note: prices are immutable in Stripe, but we can update metadata)
 */
async function updateStripePrice(priceId, planData) {
  try {
    console.log(`💰 Updating Stripe price metadata: ${priceId}...`);
    
    const updatedPrice = await stripe.prices.update(priceId, {
      metadata: planData.metadata,
    });
    
    console.log(`✅ Stripe price metadata updated: ${updatedPrice.id}`);
    return updatedPrice;
  } catch (error) {
    console.error(`❌ Error updating Stripe price ${priceId}:`, error.message);
    throw error;
  }
}

/**
 * Update Product in MongoDB
 */
async function updateProductInDatabase(existingProduct, updatedPlanData) {
  try {
    console.log(`💾 Updating database product: ${updatedPlanData.name}...`);
    
    const sortOrderMap = {
      'free': 0,
      'explore': 1,
      'execute': 2,
      'command': 3,
    };
    
    const updateData = {
      name: updatedPlanData.name,
      displayName: updatedPlanData.name,
      description: updatedPlanData.description,
      features: {
        dailyRequestLimit: updatedPlanData.features.dailyRequestLimit,
        ragType: updatedPlanData.features.ragType,
        storagePerUser: updatedPlanData.features.storagePerUser,
        canInviteTeam: updatedPlanData.features.canInviteTeam,
      },
      featuresList: updatedPlanData.featuresList,
      metadata: updatedPlanData.metadata,
      isActive: true,
      isVisible: updatedPlanData.plan !== 'free',
      sortOrder: sortOrderMap[updatedPlanData.plan] || 999,
    };
    
    const updatedProduct = await Product.findOneAndUpdate(
      { plan: updatedPlanData.plan },
      updateData,
      { new: true, upsert: false }
    );
    
    if (!updatedProduct) {
      console.log(`⚠️  Product not found in database for plan: ${updatedPlanData.plan}, skipping...`);
      return null;
    }
    
    console.log(`✅ Database product updated: ${updatedProduct.plan}`);
    return updatedProduct;
  } catch (error) {
    console.error(`❌ Error updating database product:`, error.message);
    throw error;
  }
}

/**
 * Save updated config to file
 */
function saveToConfig(results) {
  const configPath = path.join(process.cwd(), 'config', 'stripe-products.json');
  const configDir = path.dirname(configPath);

  // Create config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = {
    updatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    plans: results,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n💾 Configuration updated: ${configPath}`);
}

/**
 * Main update function
 */
async function updateStripeProducts() {
  console.log('🔄 Starting Stripe Products Update Script...\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Stripe API Key: ${process.env.STRIPE_SECRET_KEY ? '✅ Found' : '❌ Missing'}`);
  console.log(`MongoDB URI: ${process.env.DATABASE_LOCAL ? '✅ Found' : '❌ Missing'}\n`);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
    process.exit(1);
  }

  if (!process.env.DATABASE_LOCAL) {
    console.error('❌ DATABASE_LOCAL not found in environment variables');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.DATABASE_LOCAL, { family: 4 });
    console.log('✅ Connected to MongoDB\n');

    // Load existing products from config
    console.log('📄 Loading existing products from config...');
    const existingProducts = loadExistingProducts();
    console.log(`✅ Found ${existingProducts.length} existing products\n`);

    const results = [];
    let updatedCount = 0;

    // Update each plan
    for (const updatedPlan of UPDATED_PLANS) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${updatedPlan.name} (${updatedPlan.plan})`);
      console.log('='.repeat(60));

      // Find existing product for this plan
      const existingProduct = existingProducts.find(p => p.plan === updatedPlan.plan);

      if (!existingProduct) {
        console.log(`⚠️  No existing product found for ${updatedPlan.plan}, skipping...`);
        continue;
      }

      // Update Stripe Product
      await updateStripeProduct(existingProduct.productId, updatedPlan);

      // Update Stripe Price metadata (prices are immutable, but metadata can be updated)
      await updateStripePrice(existingProduct.priceId, updatedPlan);

      // Update MongoDB Product
      await updateProductInDatabase(existingProduct, updatedPlan);

      results.push({
        plan: updatedPlan.plan,
        name: updatedPlan.name,
        productId: existingProduct.productId,
        priceId: existingProduct.priceId,
        price: existingProduct.price,
        currency: existingProduct.currency,
        interval: existingProduct.interval,
        features: updatedPlan.features,
        featuresList: updatedPlan.featuresList,
      });

      updatedCount++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Save updated configuration
    saveToConfig(results);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ UPDATE COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\n📊 Updated ${updatedCount} out of ${UPDATED_PLANS.length} plans\n`);

    results.forEach((result) => {
      console.log(`${result.name}:`);
      console.log(`  Plan ID: ${result.plan}`);
      console.log(`  Product ID: ${result.productId}`);
      console.log(`  Price ID: ${result.priceId}`);
      console.log(`  Features:`);
      console.log(`    - Daily Request Limit: ${result.features.dailyRequestLimit}`);
      console.log(`    - RAG Type: ${result.features.ragType}`);
      console.log(`    - Storage Per User: ${(result.features.storagePerUser / 1073741824).toFixed(0)}GB`);
      console.log(`    - Can Invite Team: ${result.features.canInviteTeam}`);
      console.log('');
    });

    console.log('📝 Next Steps:');
    console.log('   1. Verify updates in Stripe Dashboard: https://dashboard.stripe.com/products');
    console.log('   2. Test GET /api/v1/stripe/products endpoint');
    console.log('   3. Update subscription creation logic to use new features');
    console.log('   4. Deploy limit enforcement middleware\n');

  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run update script
updateStripeProducts();
