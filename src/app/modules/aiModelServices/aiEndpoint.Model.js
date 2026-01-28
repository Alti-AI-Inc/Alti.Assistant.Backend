import mongoose from 'mongoose';

const aiEndpointSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  nickName: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  default: { type: Boolean, default: false },
  add: { type: String, required: true },
  history: { type: String, required: true },
  delete: { type: String, required: true },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

const AiEndpoint = mongoose.model('AiEndpoint', aiEndpointSchema);

export default AiEndpoint;
