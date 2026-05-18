import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  plan: { type: String, required: true, enum: ['free', 'explore', 'execute', 'command'] },
  name: { type: String, required: true },
  displayName: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  interval: { type: String, default: 'month', enum: ['month', 'year'] },
  
  // Stripe IDs
  stripeProductId: { type: String, required: true, unique: true },
  stripePriceId: { type: String, required: true, unique: true },
  
  // Plan Features
  features: {
    dailyRequestLimit: { type: Number, required: true },
    ragType: { 
      type: String, 
      required: true, 
      enum: ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic'] 
    },
    storagePerUser: { type: Number, required: true }, // in bytes
    canInviteTeam: { type: Boolean, required: true },
  },
  
  // Feature List for Display
  featuresList: [{ type: String }],
  
  // Metadata for Stripe
  metadata: {
    type: Map,
    of: String,
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  isVisible: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
}, {
  timestamps: true,
});

const Product = mongoose.model("StripeProduct", productSchema);

export default Product;