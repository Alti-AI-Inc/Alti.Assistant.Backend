import mongoose from 'mongoose';

/**
 * Products Model Schema
 * Stores subscription plans/products with pricing and feature details
 */
const ProductSchema = new mongoose.Schema(
  {
    // Plan Identification
    plan: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'explore', 'execute', 'command'],
      index: true,
    },
    name: {
      type: String,
      required: true,
      // e.g., "Free Trial", "Explore", "Execute", "Command"
    },
    displayName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },

    // Pricing
    price: {
      type: Number,
      required: true,
      min: 0,
      // Price per user per month
    },
    currency: {
      type: String,
      default: 'usd',
      lowercase: true,
    },
    interval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month',
    },

    // Stripe Integration
    stripeProductId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripePriceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Feature Limits
    features: {
      dailyWebSearchLimit: {
        type: Number,
        required: true,
        default: 10,
      },
      dailyDeepResearchLimit: {
        type: Number,
        required: true,
        default: 0,
      },
      canInviteTeam: {
        type: Boolean,
        required: true,
        default: false,
      },
      unlimitedSeats: {
        type: Boolean,
        required: true,
        default: false,
      },
    },

    // Display Features List (for marketing/UI)
    featuresList: {
      type: [String],
      default: [],
      // e.g., ["10 web searches per day", "No deep research", "Single user only"]
    },

    // Plan Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      // Hide from public listing but keep existing subscriptions
    },

    // Display Order
    sortOrder: {
      type: Number,
      default: 0,
      // For ordering plans in UI (0 = first)
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ProductSchema.index({ isActive: 1, isVisible: 1, sortOrder: 1 });
ProductSchema.index({ price: 1 });

/**
 * Static Methods
 */

// Get all active and visible plans
ProductSchema.statics.getAvailablePlans = async function () {
  return this.find({ isActive: true, isVisible: true }).sort({ sortOrder: 1 });
};

// Get plan by plan key
ProductSchema.statics.findByPlan = async function (planKey) {
  return this.findOne({ plan: planKey, isActive: true });
};

// Get plan by Stripe Product ID
ProductSchema.statics.findByStripeProductId = async function (productId) {
  return this.findOne({ stripeProductId: productId });
};

// Get plan by Stripe Price ID
ProductSchema.statics.findByStripePriceId = async function (priceId) {
  return this.findOne({ stripePriceId: priceId });
};

// Check if plan exists
ProductSchema.statics.isPlanValid = async function (planKey) {
  const plan = await this.findOne({ plan: planKey, isActive: true });
  return !!plan;
};

/**
 * Instance Methods
 */

// Get pricing summary
ProductSchema.methods.getPricingSummary = function (seats = 1) {
  return {
    plan: this.plan,
    name: this.name,
    pricePerSeat: this.price,
    seats,
    totalPrice: this.price * seats,
    currency: this.currency,
    interval: this.interval,
    formattedPrice: `$${this.price}/${this.interval}`,
    formattedTotal: `$${this.price * seats}/${this.interval}`,
  };
};

// Check if plan allows team invitations
ProductSchema.methods.allowsTeamInvites = function () {
  return this.features.canInviteTeam;
};

// Get feature limits
ProductSchema.methods.getLimits = function () {
  return {
    dailyWebSearchLimit: this.features.dailyWebSearchLimit,
    dailyDeepResearchLimit: this.features.dailyDeepResearchLimit,
    canInviteTeam: this.features.canInviteTeam,
    unlimitedSeats: this.features.unlimitedSeats,
  };
};

// Format for API response
ProductSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    plan: this.plan,
    name: this.name,
    displayName: this.displayName,
    description: this.description,
    price: this.price,
    currency: this.currency,
    interval: this.interval,
    features: this.features,
    featuresList: this.featuresList,
    sortOrder: this.sortOrder,
  };
};

const ProductModel = mongoose.model('Product', ProductSchema);

export default ProductModel;
