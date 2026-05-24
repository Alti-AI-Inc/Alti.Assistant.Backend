import mongoose, { connect } from 'mongoose';

const ComposioAuthSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  authConfigId: {
    type: String,
    required: true,
    index: true,
  },

  connectedAccountId: {
    type: String,
    index: true,
  },
  integrationId: {
    type: String,
  },
  redirectUrl: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PENDING', 'FAILED', 'EXPIRED', 'REVOKED'],
    default: 'PENDING',
    set: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  },
  accessToken: {
    type: String,
  },
  refreshToken: {
    type: String,
  },
  idToken: {
    type: String,
  },
  toolkit: {
    type: Object,
  },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
}, { timestamps: true });

// Compound index for the most common query pattern: find active connections for a user's app
ComposioAuthSchema.index({ userId: 1, status: 1, 'toolkit.slug': 1 });
// Compound index for authConfigId-based lookups
ComposioAuthSchema.index({ userId: 1, status: 1, authConfigId: 1 });

const ComposioAuth = mongoose.model('ComposioAuth', ComposioAuthSchema);

export default ComposioAuth;
