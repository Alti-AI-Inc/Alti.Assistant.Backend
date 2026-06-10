import mongoose from 'mongoose';

const ComposioRepositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
    }
    // Removed custom 'updated_at' field.
    // The 'timestamps: true' option below automatically adds 'createdAt' and 'updatedAt' fields,
    // making a custom 'updated_at' redundant and potentially confusing.
    // Relying on Mongoose's automatic 'updatedAt' for consistency.
  },
  {
    timestamps: true // This option automatically adds 'createdAt' and 'updatedAt' fields.
  }
);

// Enable full-text search on name and description for highly relevant queries
ComposioRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

const ComposioRepository = mongoose.models.ComposioRepository || mongoose.model('ComposioRepository', ComposioRepositorySchema);

export default ComposioRepository;