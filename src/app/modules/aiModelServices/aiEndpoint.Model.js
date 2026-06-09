import mongoose from 'mongoose';

const aiEndpointSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  nickName: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  default: { type: Boolean, default: false },
  // Renamed 'add' to 'addPath' to avoid conflicts with common method names
  // and improve clarity on what the field represents (e.g., an API path).
  addPath: { type: String, required: true },
  // Renamed 'history' to 'historyPath' for similar reasons as 'addPath'.
  historyPath: { type: String, required: true },
  // Renamed 'delete' to 'deletePath' to avoid conflicts with the JavaScript
  // 'delete' operator and common method names. Using 'delete' as a field name
  // can lead to syntax errors or unexpected behavior when accessing properties.
  deletePath: { type: String, required: true },

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