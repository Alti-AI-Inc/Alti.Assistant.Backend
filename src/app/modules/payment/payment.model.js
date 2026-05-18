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
    transactionId: { type: String, required: false },
    price: { type: String, required: true },
    plan_name: { type: String, required: false, enum: ['free', 'explore', 'execute', 'command'] },
    productId: { type: String, required: false },
    duration: { type: String, required: false, enum: ['month', 'year'] },
    expiresAt: { type: Date, required: false },
    paymentStatus: { type: String, enum: ['paid', 'canceled', 'expired', 'pending'] },
    invoiceUrl: { type: String, default: null },
    
    // Plan Features (copied from Product at subscription time)
    limits: {
      dailyRequestLimit: { type: Number, default: 10 },
      ragType: { 
        type: String, 
        default: 'none',
        enum: ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic']
      },
      storagePerUser: { type: Number, default: 0 }, // in bytes
      canInviteTeam: { type: Boolean, default: false },
    },
    
    // Multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    
    // Stripe subscription details
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    stripeCustomerId: { type: String },
    stripePriceId: { type: String },
    
    // Billing cycle
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAt: { type: Date },
    canceledAt: { type: Date },
  },
  { timestamps: true }
);

// DEPRECATED: Use 'LegacySubscription' to avoid conflict with new subscription.model.js
const SubscriptionModel = mongoose.model('LegacySubscription', SubscriptionSchema);

export default SubscriptionModel;