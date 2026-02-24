import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Subscription Plans Configuration
 * These will be created as Stripe Products and Prices
 */
const PLANS = [
  {
    name: 'Free Trial',
    id: 'free',
    description: 'Perfect for individuals getting started with basic features',
    price: 0,
    currency: 'usd',
    interval: 'month',
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
    name: 'Explore',
    id: 'explore',
    description: 'Basic Text Document RAG (10GB/user) - Invite Your Team',
    price: 20, // $20 per user per month
    currency: 'usd',
    interval: 'month',
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
    name: 'Execute',
    id: 'execute',
    description: 'Advanced Multi-Modal RAG (50GB/user) - Invite Your Team',
    price: 50, // $50 per user per month
    currency: 'usd',
    interval: 'month',
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
    name: 'Command',
    id: 'command',
    description: 'Premium Agentic RAG (100GB/user) - Invite Your Team',
    price: 100, // $100 per user per month
    currency: 'usd',
    interval: 'month',
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
 * Create a Stripe Product
 */
async function createProduct(plan) {
  try {
    console.log(`\n📦 Creating product: ${plan.name}...`);

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });

    console.log(`✅ Product created: ${product.id}`);
    return product;
  } catch (error) {
    console.error(`❌ Error creating product ${plan.name}:`, error.message);
    throw error;
  }
}

/**
 * Create a Stripe Price for a Product
 */
async function createPrice(plan, productId) {
  try {
    console.log(`💰 Creating price for ${plan.name}...`);

    const priceData = {
      product: productId,
      currency: plan.currency,
      metadata: {
        plan: plan.id,
      },
    };

    if (plan.price === 0) {
      // Free plan - no recurring charge
      priceData.unit_amount = 0;
      priceData.recurring = {
        interval: plan.interval,
        usage_type: 'licensed',
      };
    } else {
      // Paid plans - per-seat billing
      priceData.unit_amount = plan.price * 100; // Convert to cents
      priceData.recurring = {
        interval: plan.interval,
        usage_type: 'licensed', // Per-seat billing (quantity-based)
      };
    }

    const price = await stripe.prices.create(priceData);

    console.log(`✅ Price created: ${price.id} ($${plan.price}/${plan.interval})`);
    return price;
  } catch (error) {
    console.error(`❌ Error creating price for ${plan.name}:`, error.message);
    throw error;
  }
}

/**
 * Save product and price IDs to configuration file
 */
function saveToConfig(results) {
  const configPath = path.join(process.cwd(), 'config', 'stripe-products.json');
  const configDir = path.dirname(configPath);

  // Create config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = {
    createdAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    plans: results,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n💾 Configuration saved to: ${configPath}`);
}

/**
 * Check if products already exist
 */
async function checkExistingProducts() {
  try {
    const products = await stripe.products.list({ limit: 100 });
    const existingPlans = PLANS.map((p) => p.name);
    const existing = products.data.filter((p) => existingPlans.includes(p.name));

    if (existing.length > 0) {
      console.log('\n⚠️  Found existing products:');
      existing.forEach((p) => console.log(`   - ${p.name} (${p.id})`));
      return existing;
    }
    return [];
  } catch (error) {
    console.error('Error checking existing products:', error.message);
    return [];
  }
}

/**
 * Delete existing products (optional cleanup)
 */
async function deleteExistingProducts(products) {
  console.log('\n🗑️  Archiving existing products...');
  for (const product of products) {
    try {
      // Archive instead of delete (preserves historical data)
      await stripe.products.update(product.id, { active: false });
      console.log(`✅ Archived: ${product.name}`);
    } catch (error) {
      console.error(`❌ Error archiving ${product.name}:`, error.message);
    }
  }
}

/**
 * Main seeder function
 */
async function seedStripeProducts() {
  console.log('🚀 Starting Stripe Products Seeder...\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Stripe API Key: ${process.env.STRIPE_SECRET_KEY ? '✅ Found' : '❌ Missing'}\n`);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
    process.exit(1);
  }

  try {
    // Check for existing products
    const existing = await checkExistingProducts();

    if (existing.length > 0) {
      console.log('\n❓ Do you want to archive existing products and create new ones?');
      console.log('   Run with --force flag to archive and recreate: node scripts/seed-stripe-products.js --force');

      if (!process.argv.includes('--force')) {
        console.log('\n⏹️  Seeding cancelled. Use --force to proceed.');
        process.exit(0);
      }

      await deleteExistingProducts(existing);
    }

    const results = [];

    // Create products and prices
    for (const plan of PLANS) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${plan.name} ($${plan.price}/${plan.interval})`);
      console.log('='.repeat(60));

      const product = await createProduct(plan);
      const price = await createPrice(plan, product.id);

      results.push({
        plan: plan.id,
        name: plan.name,
        productId: product.id,
        priceId: price.id,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        features: plan.features,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Save configuration
    saveToConfig(results);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:\n');

    results.forEach((result) => {
      console.log(`${result.name}:`);
      console.log(`  Plan ID: ${result.plan}`);
      console.log(`  Product ID: ${result.productId}`);
      console.log(`  Price ID: ${result.priceId}`);
      console.log(`  Price: $${result.price}/${result.interval}`);
      console.log(`  Features:`);
      console.log(`    - Daily Request Limit: ${result.features.dailyRequestLimit}`);
      console.log(`    - RAG Type: ${result.features.ragType}`);
      console.log(`    - Storage Per User: ${(result.features.storagePerUser / 1073741824).toFixed(0)}GB`);
      console.log(`    - Can Invite Team: ${result.features.canInviteTeam}`);
      console.log('');
    });

    console.log('📝 Next Steps:');
    console.log('   1. Verify products in Stripe Dashboard: https://dashboard.stripe.com/products');
    console.log('   2. Update your application with the new product/price IDs');
    console.log('   3. Run database migration for existing users\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run seeder
seedStripeProducts();
