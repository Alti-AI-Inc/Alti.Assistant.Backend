import mongoose from 'mongoose';

/**
 * @typedef {object} ProductFeatures
 * @property {number} dailyRequestLimit - The maximum number of requests allowed per day for this plan.
 * @property {string} ragType - The type of Retrieval-Augmented Generation (RAG) available.
 * @property {number} storagePerUser - The amount of storage allocated per user in bytes.
 * @property {boolean} canInviteTeam - Indicates if users on this plan can invite team members.
 */

/**
 * @typedef {object} Product
 * @property {string} plan - The internal identifier for the subscription plan.
 * @property {string} name - The internal name of the product.
 * @property {string} displayName - The user-facing name of the product/plan.
 * @property {string} description - A detailed description of the product/plan.
 * @property {number} price - The numerical price of the plan.
 * @property {string} currency - The currency for the price (e.g., 'usd').
 * @property {string} interval - The billing interval ('month' or 'year').
 * @property {string} stripeProductId - The unique identifier for the product in Stripe.
 * @property {string} stripePriceId - The unique identifier for the price in Stripe.
 * @property {ProductFeatures} features - An object containing the specific features and limits of the plan.
 * @property {string[]} featuresList - A list of feature descriptions for display on the UI.
 * @property {Map<string, string>} [metadata] - Additional metadata to be stored in Stripe.
 * @property {boolean} isActive - Whether the product is currently active and can be subscribed to.
 * @property {boolean} isVisible - Whether the product should be visible on public-facing pages like the pricing page.
 * @property {number} sortOrder - A number to determine the display order of products.
 * @property {mongoose.Schema.Types.ObjectId | null} [tenantId] - The tenant this product belongs to. If null, it's a global product.
 * @property {Date} createdAt - The timestamp when the product was created.
 * @property {Date} updatedAt - The timestamp when the product was last updated.
 */

/**
 * Mongoose schema for Stripe Products.
 * This schema defines the structure of product and subscription plan information
 * that is synchronized with Stripe. It includes pricing, features, and metadata.
 * @type {mongoose.Schema<Product>}
 */
const productSchema = new mongoose.Schema(
  {
    /**
     * The internal identifier for the subscription plan.
     * @type {string}
     * @enum ['free', 'explore', 'execute', 'command']
     * @required
     */
    plan: {
      type: String,
      required: true,
      enum: ['free', 'explore', 'execute', 'command'],
    },
    /**
     * The internal name of the product.
     * @type {string}
     * @required
     */
    name: { type: String, required: true },
    /**
     * The user-facing name of the product/plan, used for display purposes.
     * @type {string}
     * @required
     */
    displayName: { type: String, required: true },
    /**
     * A detailed description of the product/plan.
     * @type {string}
     * @required
     */
    description: { type: String, required: true },
    /**
     * The numerical price of the plan (e.g., 29.99).
     * @type {number}
     * @required
     */
    price: { type: Number, required: true },
    /**
     * The currency for the price.
     * @type {string}
     * @default 'usd'
     */
    currency: { type: String, default: 'usd' },
    /**
     * The billing interval.
     * @type {string}
     * @enum ['month', 'year']
     * @default 'month'
     */
    interval: { type: String, default: 'month', enum: ['month', 'year'] },

    // Stripe IDs
    /**
     * The unique identifier for the product in Stripe.
     * @type {string}
     * @required
     * @unique
     */
    stripeProductId: { type: String, required: true, unique: true },
    /**
     * The unique identifier for the price associated with this product in Stripe.
     * @type {string}
     * @required
     * @unique
     */
    stripePriceId: { type: String, required: true, unique: true },

    // Plan Features
    /**
     * An object containing the specific features and limits of the plan.
     * @type {ProductFeatures}
     */
    features: {
      /**
       * The maximum number of requests allowed per day for this plan.
       * @type {number}
       * @required
       */
      dailyRequestLimit: { type: Number, required: true },
      /**
       * The type of Retrieval-Augmented Generation (RAG) available for this plan.
       * @type {string}
       * @enum ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic']
       * @required
       */
      ragType: {
        type: String,
        required: true,
        enum: ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic'],
      },
      /**
       * The amount of storage allocated per user in bytes.
       * @type {number}
       * @required
       */
      storagePerUser: { type: Number, required: true }, // in bytes
      /**
       * Indicates if users on this plan can invite team members.
       * @type {boolean}
       * @required
       */
      canInviteTeam: { type: Boolean, required: true },
      // Monthly allowances (pool-based)
      researchLimit: { type: Number, default: 0 },
      imageLimit: { type: Number, default: 0 },
      videoLimit: { type: Number, default: 0 },
      taskLimit: { type: Number, default: 0 },
      workflowLimit: { type: Number, default: 0 },
      searchLimit: { type: Number, default: 0 },
      writeLimit: { type: Number, default: 0 },
      codeLimit: { type: Number, default: 0 },
      projectsLimit: { type: Number, default: 0 },
      modelsLimit: { type: Number, default: 0 },
      knowledgeLimit: { type: Number, default: 0 },
    },

    // Feature List for Display
    /**
     * A list of feature descriptions for display on the UI (e.g., pricing page).
     * @type {string[]}
     */
    featuresList: [{ type: String }],

    // Metadata for Stripe
    /**
     * Additional metadata to be stored in Stripe. Can be used for custom logic or tracking.
     * @type {Map<string, string>}
     */
    metadata: {
      type: Map,
      of: String,
    },

    // Status
    /**
     * Whether the product is currently active and can be subscribed to.
     * @type {boolean}
     * @default true
     */
    isActive: { type: Boolean, default: true },
    /**
     * Whether the product should be visible on public-facing pages like the pricing page.
     * @type {boolean}
     * @default true
     */
    isVisible: { type: Boolean, default: true },
    /**
     * A number to determine the display order of products on the UI. Lower numbers appear first.
     * @type {number}
     * @default 0
     */
    sortOrder: { type: Number, default: 0 },

    // Multi-tenant support
    /**
     * The tenant this product belongs to. If null, it's a global, system-wide product.
     * This allows for creating tenant-specific custom plans.
     * @type {mongoose.Schema.Types.ObjectId | null}
     * @ref Tenant
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    /**
     * Automatically adds `createdAt` and `updatedAt` fields.
     */
    timestamps: true,
  }
);

/**
 * Mongoose model for Stripe Products.
 * @type {mongoose.Model<Product>}
 */
const Product = mongoose.model('StripeProduct', productSchema);

export default Product;