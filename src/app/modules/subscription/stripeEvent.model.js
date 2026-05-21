import mongoose from 'mongoose';

const StripeEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days TTL in seconds
    },
  },
  {
    timestamps: true,
  }
);

const StripeEvent = mongoose.model('StripeEvent', StripeEventSchema);
export default StripeEvent;
