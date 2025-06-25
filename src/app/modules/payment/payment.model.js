import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transactionId: { type: String, required: true },
    price: { type: Number, required: true },
    plan_name: { type: String, required: true, enum: ['explore', 'analyze', 'execute', 'command'] },
    duration: { type: String, required: true, enum: ['month', 'year'] },
    expiresAt: { type: Date, required: true },
    paymentStatus: { type: String, enum: ['paid', 'canceled', 'expired', 'pending']},
    invoiceUrl: { type: String, default: null },
    usage: {
      promptsUsed: { type: Number, default: 0 },
      imagesUsed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const SubscriptionModel = mongoose.model('Subscription', SubscriptionSchema);

export default SubscriptionModel;