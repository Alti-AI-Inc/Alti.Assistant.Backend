import mongoose from 'mongoose';

const TokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ['emailVerification', 'passwordReset', 'deleteAccount'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Token = mongoose.model('Token', TokenSchema);

export default Token;
