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
  }
});

const ComposioAuth = mongoose.model("ComposioAuth", ComposioAuthSchema);

export default ComposioAuth;