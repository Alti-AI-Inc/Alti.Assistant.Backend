import mongoose from 'mongoose';

const supportSchema = new mongoose.Schema(
  {
    // email: { type: String, required: true },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'closed'],
      default: 'open',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  },
);

const Support = mongoose.model('Support', supportSchema);

export default Support;
