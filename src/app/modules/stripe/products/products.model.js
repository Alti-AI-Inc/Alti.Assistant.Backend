import mongoose from "mongoose";


const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  metadata: {
    connectors_limit: { type: String, required: true },
    storage_limit_gb: { type: String, required: true },
    plan_level: { type: String, required: true },
  },
  prices: [
    {
      nickname: { type: String, required: true },
      unit_amount: { type: Number, required: true },
      interval: { type: String, required: true },
    },
  ],
  stripe_product_id: { type: String, required: true },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

const Product = mongoose.model("StripeProduct", productSchema);

export default Product;