/**
 * @file Defines the Mongoose schema and model for Composio Repositories.
 * @module models/composioRepository
 */

import mongoose from 'mongoose';

/**
 * Mongoose schema for storing information about Composio repositories.
 * These repositories are typically sourced from platforms like GitHub and represent
 * tools or integrations available through Composio.
 * @class ComposioRepositorySchema
 * @type {mongoose.Schema}
 */
const ComposioRepositorySchema = new mongoose.Schema(
  {
    /**
     * The name of the repository.
     * @type {string}
     * @required
     * @indexed
     */
    name: {
      type: String,
      required: true,
      index: true
    },
    /**
     * A brief description of the repository's purpose.
     * @type {string}
     * @default ''
     */
    description: {
      type: String,
      default: ''
    },
    /**
     * The software license under which the repository is distributed.
     * @type {string}
     * @required
     * @enum ['MIT', 'Apache 2.0']
     * @indexed
     */
    license: {
      type: String,
      required: true,
      enum: ['MIT', 'Apache 2.0'],
      index: true
    },
    /**
     * The web URL to the repository's main page (e.g., on GitHub).
     * @type {string}
     * @required
     */
    html_url: {
      type: String,
      required: true
    },
    /**
     * The URL used to clone the repository via Git.
     * @type {string}
     * @required
     */
    clone_url: {
      type: String,
      required: true
    },
    /**
     * The number of stars the repository has received.
     * @type {number}
     * @default 0
     */
    stars: {
      type: Number,
      default: 0
    },
    /**
     * The number of times the repository has been forked.
     * @type {number}
     * @default 0
     */
    forks: {
      type: Number,
      default: 0
    },
    /**
     * The primary programming language of the repository.
     * @type {string}
     * @default 'Unknown'
     * @indexed
     */
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
    /**
     * Mongoose schema options.
     * @property {boolean} timestamps - If true, Mongoose adds createdAt and updatedAt properties to the schema.
     */
    timestamps: true // This option automatically adds 'createdAt' and 'updatedAt' fields.
  }
);

/**
 * Creates a text index on the 'name' and 'description' fields to enable efficient
 * full-text search capabilities. The 'name' field is given a higher weight to prioritize
 * matches in the repository name over the description.
 * 'language_override: 'none'' is used to prevent stemming and stop words for more literal matching.
 */
// Enable full-text search on name and description for highly relevant queries
ComposioRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

/**
 * The Mongoose model for a Composio Repository.
 * This model is used to interact with the 'composiorepositories' collection in MongoDB.
 * It prevents model recompilation by checking if the model already exists in `mongoose.models`.
 * @model ComposioRepository
 * @type {mongoose.Model<ComposioRepositorySchema>}
 */
const ComposioRepository = mongoose.models.ComposioRepository || mongoose.model('ComposioRepository', ComposioRepositorySchema);

export default ComposioRepository;