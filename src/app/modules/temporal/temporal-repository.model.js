import mongoose from 'mongoose';

/**
 * @typedef {object} TemporalRepositoryDocument
 * @property {string} name - The unique name of the temporal repository.
 * @property {string} [description=''] - A brief description of the repository.
 * @property {'MIT License'|'Apache License 2.0'} license - The full name of the license used by the repository.
 * @property {'mit'|'apache-2.0'} license_key - The SPDX identifier for the license.
 * @property {string} html_url - The URL to the repository's page on a web platform (e.g., GitHub).
 * @property {string} clone_url - The URL used to clone the repository (e.g., Git URL).
 * @property {number} [stars=0] - The number of stars or likes the repository has received.
 * @property {boolean} [archived=false] - Indicates if the repository is archived.
 * @property {string} local_path - The local file system path where the repository is cloned.
 * @property {'Active'|'Archived'} [status='Active'] - The operational status of the repository within the system.
 * @property {Date} createdAt - The timestamp when the repository record was created.
 * @property {Date} updatedAt - The timestamp when the repository record was last updated.
 */

/**
 * Mongoose Schema for the Temporal Repository.
 * Defines the structure and validation rules for storing information about temporal repositories.
 *
 * @type {mongoose.Schema<TemporalRepositoryDocument>}
 */
const TemporalRepositorySchema = new mongoose.Schema(
  {
    /**
     * The unique name of the temporal repository.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    name: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    /**
     * A brief description of the repository.
     * @type {string}
     * @default ''
     */
    description: {
      type: String,
      default: ''
    },
    /**
     * The full name of the license used by the repository.
     * @type {'MIT License'|'Apache License 2.0'}
     * @required
     * @enum ['MIT License', 'Apache License 2.0']
     * @index
     */
    license: {
      type: String,
      required: true,
      enum: ['MIT License', 'Apache License 2.0'],
      index: true
    },
    /**
     * The SPDX identifier for the license.
     * @type {'mit'|'apache-2.0'}
     * @required
     * @enum ['mit', 'apache-2.0']
     * @index
     */
    license_key: {
      type: String,
      required: true,
      enum: ['mit', 'apache-2.0'],
      index: true
    },
    /**
     * The URL to the repository's page on a web platform (e.g., GitHub).
     * @type {string}
     * @required
     */
    html_url: {
      type: String,
      required: true
    },
    /**
     * The URL used to clone the repository (e.g., Git URL).
     * @type {string}
     * @required
     */
    clone_url: {
      type: String,
      required: true
    },
    /**
     * The number of stars or likes the repository has received.
     * @type {number}
     * @default 0
     * @index
     */
    stars: {
      type: Number,
      default: 0,
      index: true
    },
    /**
     * Indicates if the repository is archived.
     * @type {boolean}
     * @default false
     * @index
     */
    archived: {
      type: Boolean,
      default: false,
      index: true
    },
    /**
     * The local file system path where the repository is cloned.
     * @type {string}
     * @required
     */
    local_path: {
      type: String,
      required: true
    },
    /**
     * The operational status of the repository within the system.
     * @type {'Active'|'Archived'}
     * @enum ['Active', 'Archived']
     * @default 'Active'
     * @index
     */
    status: {
      type: String,
      enum: ['Active', 'Archived'],
      default: 'Active',
      index: true
    }
  },
  {
    /**
     * Mongoose timestamps option.
     * Adds `createdAt` and `updatedAt` fields automatically.
     */
    timestamps: true
  }
);

/**
 * Enable full-text search index on the `name` and `description` fields.
 * Weights are assigned to prioritize matches in the name field.
 * The index is named 'TemporalTextIndex' and language override is set to 'none'.
 */
TemporalRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TemporalTextIndex', language_override: 'none' }
);

/**
 * Mongoose Model for the Temporal Repository.
 * Represents the 'TemporalRepository' collection in MongoDB, allowing for
 * CRUD operations and data interaction based on the defined schema.
 *
 * @type {mongoose.Model<TemporalRepositoryDocument>}
 */
const TemporalRepository = mongoose.models.TemporalRepository || mongoose.model('TemporalRepository', TemporalRepositorySchema);

/**
 * Exports the TemporalRepository Mongoose Model.
 * @module TemporalRepository
 */
export default TemporalRepository;