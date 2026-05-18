import mongoose from 'mongoose';

const AuthConfigSchema = mongoose.Schema({
  app: {
    type: String,
    required: true,
  },
  authConfigId: {
    type: String,
    required: true,
  },
  authSchema: {
    type: String,
    required: false,
  },
  isComposioManaged: {
    type: Boolean,
    default: false,
  },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

const AuthConfig = mongoose.model('AuthConfig', AuthConfigSchema);

export default AuthConfig;
