import mongoose from 'mongoose';

const GoogleRepositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      index: true
    },
    org: {
      type: String,
      required: true,
      enum: ['GoogleCloudPlatform', 'google'],
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    license: {
      type: String,
      required: true,
      enum: ['MIT', 'Apache 2.0'],
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
      default: 0
    },
    forks: {
      type: Number,
      default: 0
    },
    language: {
      type: String,
      default: 'Unknown',
      index: true
    },
    updated_at: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Enable full-text search on name and description for highly relevant queries
GoogleRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex' }
);

const GoogleRepository = mongoose.models.GoogleRepository || mongoose.model('GoogleRepository', GoogleRepositorySchema);

export default GoogleRepository;
