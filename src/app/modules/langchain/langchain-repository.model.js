import mongoose from 'mongoose';

/**
 * @typedef {Object} ILangchainRepository
 * @property {string} name - The name of the Langchain repository.
 * @property {string} [description=''] - A brief description of the repository.
 * @property {'MIT' | 'Apache 2.0'} license - The license type of the repository.
 * @property {string} html_url - The HTTP URL to the repository on GitHub/GitLab.
 * @property {string} clone_url - The Git clone URL for the repository.
 * @property {number} [stars=0] - The number of stars the repository has.
 * @property {number} [forks=0] - The number of forks the repository has.
 * @property {string} [language='Unknown'] - The primary programming language of the repository.
 * @property {Date} [updated_at] - The last update timestamp from the remote repository.
 * @property {Date} createdAt - The timestamp when the document was created in the database.
 * @property {Date} updatedAt - The timestamp when the document was last updated in the database.
 */

/**
 * Mongoose schema definition for the LangchainRepository model.
 * Represents a tracked Langchain-related repository.
 * 
 * @type {import('mongoose').Schema<ILangchainRepository>}
 */
const LangchainRepositorySchema = new mongoose.Schema(
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
LangchainRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

/**
 * Mongoose Model for LangchainRepository.
 * Provides database access and operations for Langchain repositories.
 * 
 * @type {import('mongoose').Model<ILangchainRepository>}
 */
const LangchainRepository = mongoose.models.LangchainRepository || mongoose.model('LangchainRepository', LangchainRepositorySchema);

export default LangchainRepository;