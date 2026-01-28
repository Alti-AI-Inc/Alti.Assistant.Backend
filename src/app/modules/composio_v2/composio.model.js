import mongoose, { connect } from "mongoose";

const ComposioAuthSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  authConfigId: {
    type: String,
    required: true,
    index: true
  },

  connectedAccountId: {
    type: String
  },
  integrationId: {
    type: String,
  },
  redirectUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
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
    type: Object
  },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

const ComposioAuth = mongoose.model("ComposioAuth", ComposioAuthSchema);

export default ComposioAuth;