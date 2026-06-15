import mongoose from 'mongoose';

const UserCodeStatsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  conversationCount: {
    type: Number,
    default: 0,
  },
  messageCount: {
    type: Number,
    default: 0,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
  },
});

export const UserCodeStats = mongoose.model('UserCodeStats', UserCodeStatsSchema);
