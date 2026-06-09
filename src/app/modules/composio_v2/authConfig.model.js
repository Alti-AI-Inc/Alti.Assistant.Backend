import mongoose from 'mongoose';

const AuthConfigSchema = mongoose.Schema({
  app: {
    type: String,
    required: true,
    // Removed 'unique: true' from 'app' field. In a multi-tenant setup,
    // 'app' names should typically be unique per tenant, not globally.
    // A compound unique index on 'app' and 'tenantId' is added below to enforce this.
    index: true,
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
}, { timestamps: true });

// Add a compound unique index on 'app' and 'tenantId'.
// This ensures that an 'app' name is unique within the scope of a specific 'tenantId'.
// If 'tenantId' is null, it will enforce uniqueness for 'app' names that are not associated with any tenant.
AuthConfigSchema.index({ app: 1, tenantId: 1 }, { unique: true });

const AuthConfig = mongoose.model('AuthConfig', AuthConfigSchema);

export default AuthConfig;