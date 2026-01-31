import mongoose from 'mongoose';

/**
 * DEPRECATED: This model has been merged into subscription.model.js
 * All subscription logic now uses src/app/modules/subscription/subscription.model.js
 * 
 * This file is kept temporarily for reference during migration.
 * After all existing subscriptions are migrated, this file can be deleted.
 * 
 * Migration path:
 * 1. Use subscription.model.js for all new subscriptions
 * 2. Run migration script to move existing data
 * 3. Update all imports to use new model
 * 4. Delete this file
 */

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transactionId: { type: String, required: true },
    price: { type: Number, required: true },
    plan_name: { type: String, required: true, enum: ['explore', 'analyze', 'execute', 'command'] },
    duration: { type: String, required: true, enum: ['month', 'year'] },
    expiresAt: { type: Date, required: true },
    paymentStatus: { type: String, enum: ['paid', 'canceled', 'expired', 'pending'] },
    invoiceUrl: { type: String, default: null },
    usage: {
      promptsUsed: { type: Number, default: 0 },
      imagesUsed: { type: Number, default: 0 },
    },

    // Multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// DEPRECATED: Use 'LegacySubscription' to avoid conflict with new subscription.model.js
const SubscriptionModel = mongoose.model('LegacySubscription', SubscriptionSchema);

export default SubscriptionModel;