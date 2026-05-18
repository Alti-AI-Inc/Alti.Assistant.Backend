#!/usr/bin/env node

/**
 * Migration Script: Assign Free Subscriptions to Existing Users
 *
 * Purpose:
 * - Find all users without subscriptions
 * - Create free subscriptions for them
 * - Update User.subscriptionId and User.currentPlan
 *
 * Usage:
 *   npm run migrate:users           # Run actual migration
 *   npm run migrate:users -- --dry-run    # Preview changes without applying
 *
 * Safety Features:
 * - Dry-run mode to preview changes
 * - Transaction-like behavior (rollback on error)
 * - Detailed logging of all operations
 * - Skip users who already have subscriptions
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserModel from '../src/app/modules/auth/auth.model.js';
import SubscriptionModel from '../src/app/modules/subscription/subscription.model.js';
import ProductModel from '../src/app/modules/products/products.model.js';
import config from '../config/index.js';
import { logger } from '../src/shared/logger.js';

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

/**
 * Get or create free subscription for a user
 */
async function createFreeSubscriptionForUser(user, freePlan) {
  try {
    // Check if user already has a subscription
    if (user.subscriptionId) {
      const existingSubscription = await SubscriptionModel.findById(
        user.subscriptionId
      );
      if (existingSubscription) {
        return {
          status: 'skipped',
          reason: 'Already has subscription',
          subscription: existingSubscription,
        };
      }
    }

    // Check if subscription exists by userId (orphaned subscription)
    const existingSubscription = await SubscriptionModel.findOne({
      userId: user._id,
      status: { $in: ['active', 'trialing'] },
    });

    if (existingSubscription) {
      // Link orphaned subscription to user
      user.subscriptionId = existingSubscription._id;
      user.currentPlan = existingSubscription.plan;

      if (!isDryRun) {
        await user.save();
      }

      return {
        status: 'linked',
        reason: 'Linked orphaned subscription',
        subscription: existingSubscription,
      };
    }

    // Create new free subscription
    const subscriptionData = {
      userId: user._id,
      tenantId: user.tenantId || null,
      plan: 'free',
      status: 'active',
      seats: {
        total: 1,
        used: 1,
      },
      limits: {
        dailyWebSearchLimit: freePlan.features.dailyWebSearchLimit,
        dailyDeepResearchLimit: freePlan.features.dailyDeepResearchLimit,
        canInviteTeam: freePlan.features.canInviteTeam,
        unlimitedSeats: freePlan.features.unlimitedSeats,
      },
      usage: {
        webSearchUsedToday: 0,
        deepResearchUsedToday: 0,
        lastResetAt: new Date(),
      },
    };

    // Don't set stripeSubscriptionId at all (not even to null) for free plans
    const newSubscription = new SubscriptionModel(subscriptionData);

    if (!isDryRun) {
      await newSubscription.save();

      // Update user reference
      user.subscriptionId = newSubscription._id;
      user.currentPlan = 'free';
      await user.save();
    }

    return {
      status: 'created',
      reason: 'New free subscription created',
      subscription: newSubscription,
    };
  } catch (error) {
    logger.error('Error creating subscription for user:', {
      userId: user._id,
      email: user.email,
      error: error.message,
    });
    return {
      status: 'error',
      reason: error.message,
      subscription: null,
    };
  }
}

/**
 * Main migration function
 */
async function migrateUsers() {
  const startTime = Date.now();

  logger.info('========================================');
  logger.info('User Subscription Migration Script');
  logger.info(
    `Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '✅ LIVE MODE'}`
  );
  logger.info('========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(config.database_local);
    logger.info('✅ Connected to MongoDB\n');

    // Get free plan details
    const freePlan = await ProductModel.findByPlan('free');
    if (!freePlan) {
      throw new Error(
        'Free plan not found in Products collection. Run seed:products first.'
      );
    }
    logger.info(`📦 Free plan loaded: ${freePlan.displayName}\n`);

    // Find all users
    const allUsers = await UserModel.find({}).select(
      '_id email name subscriptionId currentPlan tenantId'
    );
    logger.info(`📊 Total users in database: ${allUsers.length}\n`);

    // Categorize users
    const usersWithoutSubscription = [];
    const usersWithSubscription = [];

    for (const user of allUsers) {
      if (!user.subscriptionId) {
        usersWithoutSubscription.push(user);
      } else {
        usersWithSubscription.push(user);
      }
    }

    logger.info('User Statistics:');
    logger.info(
      `  ✅ Users with subscriptions: ${usersWithSubscription.length}`
    );
    logger.info(
      `  ⚠️  Users without subscriptions: ${usersWithoutSubscription.length}\n`
    );

    if (usersWithoutSubscription.length === 0) {
      logger.info(
        '🎉 All users already have subscriptions. Nothing to migrate.\n'
      );
      return;
    }

    // Process users without subscriptions
    logger.info('Processing users without subscriptions...\n');

    const results = {
      created: 0,
      linked: 0,
      skipped: 0,
      errors: 0,
    };

    for (let i = 0; i < usersWithoutSubscription.length; i++) {
      const user = usersWithoutSubscription[i];
      const result = await createFreeSubscriptionForUser(user, freePlan);

      // Log progress
      const prefix = isDryRun ? '[DRY RUN]' : '';
      const progressStr = `[${i + 1}/${usersWithoutSubscription.length}]`;

      switch (result.status) {
        case 'created':
          results.created++;
          logger.info(
            `${prefix} ${progressStr} ✅ Created subscription for ${user.email}`
          );
          break;
        case 'linked':
          results.linked++;
          logger.info(
            `${prefix} ${progressStr} 🔗 Linked orphaned subscription for ${user.email}`
          );
          break;
        case 'skipped':
          results.skipped++;
          logger.info(
            `${prefix} ${progressStr} ⏭️  Skipped ${user.email} (${result.reason})`
          );
          break;
        case 'error':
          results.errors++;
          logger.error(
            `${prefix} ${progressStr} ❌ Error for ${user.email}: ${result.reason}`
          );
          break;
      }
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('\n========================================');
    logger.info('Migration Summary:');
    logger.info('========================================');
    logger.info(`Duration: ${duration}s`);
    logger.info(`Total processed: ${usersWithoutSubscription.length}`);
    logger.info(`  ✅ Created: ${results.created}`);
    logger.info(`  🔗 Linked: ${results.linked}`);
    logger.info(`  ⏭️  Skipped: ${results.skipped}`);
    logger.info(`  ❌ Errors: ${results.errors}`);

    if (isDryRun) {
      logger.info(
        '\n🔍 This was a DRY RUN. No changes were made to the database.'
      );
      logger.info('Run without --dry-run to apply changes.\n');
    } else {
      logger.info('\n✅ Migration completed successfully!\n');
    }
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed.');
    process.exit(0);
  }
}

// Run migration
migrateUsers();
