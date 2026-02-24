import mongoose from 'mongoose';

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

// Indexes for performance
SubscriptionSchema.index({ userId: 1, paymentStatus: 1 });
SubscriptionSchema.index({ tenantId: 1, paymentStatus: 1 });
SubscriptionSchema.index({ stripeSubscriptionId: 1 });
SubscriptionSchema.index({ expiresAt: 1 });

const SubscriptionModel = mongoose.model('Subscription', SubscriptionSchema);

export default SubscriptionModel;