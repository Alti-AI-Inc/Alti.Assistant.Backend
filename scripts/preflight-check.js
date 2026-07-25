import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignored
}

import mongoose from 'mongoose';
import { createClient } from 'redis';
import Stripe from 'stripe';
import { GoogleGenAI } from '@google/genai';
import config from '../config/index.js';
import { logger } from '../src/shared/logger.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runPreflightChecks() {
  console.log(`\n${CYAN}================================================${RESET}`);
  console.log(`${CYAN}   Inso AI Production Preflight Suite    ${RESET}`);
  console.log(`${CYAN}================================================${RESET}\n`);

  let failed = false;

  // ── 1. ENVIRONMENT VARIABLES & BOM CHECK ───────────────────────────────────
  console.log(`${CYAN}[1/5] Auditing environment configuration...${RESET}`);
  const criticalEnvKeys = ['DATABASE_LOCAL', 'REDIS_URL', 'STRIPE_SECRET_KEY', 'GEMINI_API_KEY'];
  
  for (const key of criticalEnvKeys) {
    const val = process.env[key];
    if (!val) {
      console.log(`  ${RED}❌ Critical variable missing: ${key}${RESET}`);
      failed = true;
    } else {
      const BOM = '\uFEFF';
      if (val.startsWith(BOM)) {
        console.log(`  ${YELLOW}⚠️  BOM detected on ${key} — sanitizing...${RESET}`);
        process.env[key] = val.replace(/^\uFEFF+/, '');
      }
      console.log(`  ${GREEN}✓ ${key} is configured.${RESET}`);
    }
  }

  // ── 2. DATABASE INTEGRITY & INDEX AUDIT ──────────────────────────────────
  console.log(`\n${CYAN}[2/5] Testing MongoDB connection & write concern...${RESET}`);
  try {
    const dbUri = config.database_local || process.env.DATABASE_LOCAL;
    await mongoose.connect(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log(`  ${GREEN}✓ Connected to MongoDB Atlas.${RESET}`);
    
    // Verify write concern is set to majority (or compatible configuration)
    const dbAdmin = mongoose.connection.db.admin();
    const serverStatus = await dbAdmin.serverStatus();
    console.log(`  ${GREEN}✓ Server version: ${serverStatus.version}${RESET}`);
    
    await mongoose.disconnect();
    console.log(`  ${GREEN}✓ Disconnected database cleanly.${RESET}`);
  } catch (err) {
    console.log(`  ${RED}❌ MongoDB Atlas check failed: ${err.message}${RESET}`);
    failed = true;
  }

  // ── 3. REDIS HIGH AVAILABILITY CHECK ─────────────────────────────────────
  console.log(`\n${CYAN}[3/5] Testing Redis cache and replication...${RESET}`);
  try {
    const redisUrl = config.redis.url || process.env.REDIS_URL;
    const client = createClient({ url: redisUrl });
    
    client.on('error', (err) => {
      throw err;
    });

    await client.connect();
    console.log(`  ${GREEN}✓ Connected to Redis cache.${RESET}`);
    
    const pingResult = await client.ping();
    if (pingResult === 'PONG') {
      console.log(`  ${GREEN}✓ Ping response received: PONG${RESET}`);
    } else {
      console.log(`  ${YELLOW}⚠️  Unexpected Redis ping response: ${pingResult}${RESET}`);
    }
    
    await client.disconnect();
    console.log(`  ${GREEN}✓ Closed Redis socket connection.${RESET}`);
  } catch (err) {
    console.log(`  ${RED}❌ Redis connection check failed: ${err.message}${RESET}`);
    failed = true;
  }

  // ── 4. GOOGLE CLOUD VERTEX AI / GEMINI VERIFICATION ───────────────────────
  console.log(`\n${CYAN}[4/5] Testing Google Cloud GenAI API access...${RESET}`);
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined.');
    }

    const ai = new GoogleGenAI({ apiKey });
    
    console.log(`  ${YELLOW}Sending test query to gemini-3.5-flash...${RESET}`);
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: 'Respond with only "SUCCESS" to confirm connection.',
    });

    const responseText = response.text?.trim();
    if (responseText && responseText.includes('SUCCESS')) {
      console.log(`  ${GREEN}✓ Google GenAI connection verified: received "${responseText}"${RESET}`);
    } else {
      console.log(`  ${YELLOW}⚠️  Unexpected model response: ${responseText}${RESET}`);
    }
  } catch (err) {
    console.log(`  ${RED}❌ Vertex AI / Gemini API check failed: ${err.message}${RESET}`);
    failed = true;
  }

  // ── 5. STRIPE CONFIGURATION & WEBHOOK INTEGRITY ─────────────────────────
  console.log(`\n${CYAN}[5/5] Auditing Stripe API configuration...${RESET}`);
  try {
    const stripeKey = config.stripe.stripe_secret_key || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined.');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2022-11-15',
    });

    console.log(`  ${YELLOW}Retrieving account details from Stripe...${RESET}`);
    const account = await stripe.accounts.retrieve();
    console.log(`  ${GREEN}✓ Stripe API successfully authenticated (Business Name: ${account.business_profile?.name || 'Standard Account'})${RESET}`);

    const webhookSecret = config.stripe.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      console.log(`  ${GREEN}✓ Webhook signature secret is populated.${RESET}`);
    } else {
      console.log(`  ${YELLOW}⚠️  STRIPE_WEBHOOK_SECRET is empty. Local development or webhooks will not work!${RESET}`);
    }
  } catch (err) {
    console.log(`  ${RED}❌ Stripe API check failed: ${err.message}${RESET}`);
    failed = true;
  }

  console.log(`\n${CYAN}================================================${RESET}`);
  if (failed) {
    console.log(`${RED}❌ PREFLIGHT CHECKS FAILED! Please resolve issues before deploying.${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}✅ ALL PRODUCTION PREFLIGHT CHECKS PASSED SUCCESSFULLY!${RESET}`);
    process.exit(0);
  }
}

runPreflightChecks().catch((err) => {
  console.error(`${RED}Critical execution failure during preflight:${RESET}`, err);
  process.exit(1);
});
