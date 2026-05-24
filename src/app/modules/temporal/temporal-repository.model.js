import mongoose from 'mongoose';

const TemporalRepositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    license: {
      type: String,
      required: true,
      enum: ['MIT License', 'Apache License 2.0'],
      index: true
    },
    license_key: {
      type: String,
      required: true,
      enum: ['mit', 'apache-2.0'],
      index: true
    },
    html_url: {
      type: String,
      required: true
    },
    clone_url: {
      type: String,
      required: true
    },
    stars: {
      type: Number,
      default: 0,
      index: true
    },
    archived: {
      type: Boolean,
      default: false,
      index: true
    },
    local_path: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['Active', 'Archived'],
      default: 'Active',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Enable full-text search index on name and description
TemporalRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TemporalTextIndex', language_override: 'none' }
);

const TemporalRepository = mongoose.models.TemporalRepository || mongoose.model('TemporalRepository', TemporalRepositorySchema);

export default TemporalRepository;
