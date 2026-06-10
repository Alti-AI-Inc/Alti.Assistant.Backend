import mongoose from 'mongoose';

/**
 * @typedef {Object} IGoogleRepository
 * @property {string} name - The name of the Google repository.
 * @property {'GoogleCloudPlatform'|'google'} org - The organization owning the repository.
 * @property {string} [description=''] - A brief description of the repository.
 * @property {'MIT'|'Apache 2.0'} license - The license type of the repository.
 * @property {string} html_url - The HTTP URL to view the repository on GitHub.
 * @property {string} clone_url - The Git URL to clone the repository.
 * @property {number} [stars=0] - The number of stars the repository has received.
 * @property {number} [forks=0] - The number of forks of the repository.
 * @property {string} [language='Unknown'] - The primary programming language of the repository.
 * @property {Date} createdAt - Timestamp when the document was created (automatically managed by Mongoose).
 * @property {Date} updatedAt - Timestamp when the document was last updated (automatically managed by Mongoose).
 */

/**
 * Mongoose schema definition for Google Repositories.
 * Represents metadata harvested from official Google GitHub organizations.
 * Includes full-text search indexes on name and description.
 * 
 * @type {import('mongoose').Schema<IGoogleRepository>}
 */
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
    }
    // The 'updated_at' field is redundant because 'timestamps: true'
    // automatically adds 'createdAt' and 'updatedAt' fields.
  },
  {
    timestamps: true // This option automatically adds 'createdAt' and 'updatedAt' fields.
  }
);

// Enable full-text search on name and description for highly relevant queries
GoogleRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex' }
);

/**
 * Mongoose Model for GoogleRepository.
 * Provides database access and operations for Google repository documents.
 * 
 * @type {import('mongoose').Model<IGoogleRepository>}
 */
const GoogleRepository = mongoose.models.GoogleRepository || mongoose.model('GoogleRepository', GoogleRepositorySchema);

export default GoogleRepository;