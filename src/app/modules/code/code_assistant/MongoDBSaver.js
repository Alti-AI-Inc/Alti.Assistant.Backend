import mongoose from 'mongoose';
import { BaseCheckpointSaver } from '@langchain/langgraph';

/**
 * @typedef {object} CheckpointSchema
 * @property {string} _id - The unique identifier for the checkpoint, typically the thread_id.
 * @property {Date} ts - The timestamp when the checkpoint was last updated.
 * @property {object} channel_values - The current state values of the LangGraph channels.
 * @property {object} channel_versions - The version numbers for each LangGraph channel.
 * @property {object} versions_seen - A record of versions seen for different parts of the graph.
 */

/**
 * Defines the Mongoose schema for a LangGraph checkpoint document.
 * This schema provides structure and validation for storing conversation states in MongoDB.
 *
 * @type {mongoose.Schema<CheckpointSchema>}
 */
const checkpointSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Using thread_id as the document ID
    ts: { type: Date, required: true },
    channel_values: { type: Object, required: true },
    channel_versions: { type: Object, required: true },
    versions_seen: { type: Object, required: true },
  },
  {
    // Mongoose-specific options
    versionKey: false, // Disable the __v version key
    timestamps: true, // Automatically manage createdAt and updatedAt fields
  }
);

/**
 * Mongoose model for the 'Checkpoint' collection.
 * This model provides the interface for interacting with the MongoDB collection
 * to perform CRUD operations on checkpoint documents.
 *
 * @type {mongoose.Model<CheckpointSchema>}
 */
const CheckpointModel = mongoose.model('Checkpoint', checkpointSchema);

/**
 * A custom checkpointer class that saves and loads LangGraph conversation
 * states to and from a MongoDB collection using Mongoose.
 * It extends `BaseCheckpointSaver` from `@langchain/langgraph` to integrate
 * with the LangGraph checkpointing mechanism.
 */
export class MongoDBSaver extends BaseCheckpointSaver {
  /**
   * Initializes a new instance of the MongoDBSaver.
   * The parent `BaseCheckpointSaver` constructor is called.
   */
  constructor() {
    super(); // Pass a serializer to the parent class
  }

  /**
   * Static factory method to create a `MongoDBSaver` instance and establish
   * a MongoDB connection if one is not already active.
   *
   * @param {string} uri - The MongoDB connection URI.
   * @returns {Promise<MongoDBSaver>} A promise that resolves to a new `MongoDBSaver` instance.
   */
  static async fromUri(uri) {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(uri, { family: 4 });
      console.log('Successfully connected to MongoDB via Mongoose.');
    }
    return new MongoDBSaver();
  }

  /**
   * Retrieves a checkpoint along with its configuration and metadata.
   * This method first calls `get` to fetch the checkpoint data.
   *
   * @param {object} config - The configuration object, typically containing `configurable.thread_id`.
   * @returns {Promise<object|null>} A promise that resolves to an object containing `config`, `checkpoint`, and `metadata`,
   *                                  or `null` if no checkpoint is found.
   * @property {object} config - The input configuration.
   * @property {object} checkpoint - The retrieved checkpoint data.
   * @property {object} metadata - Additional metadata about the checkpoint source.
   */
  async getTuple(config) {
    const checkpoint = await this.get(config);
    if (!checkpoint) {
      return null;
    }

    return {
      config,
      checkpoint,
      metadata: { source: 'mongoose' },
    };
  }

  /**
   * Retrieves the latest checkpoint for a given thread ID from MongoDB.
   *
   * @param {object} config - The configuration object.
   * @param {string} config.configurable.thread_id - The unique identifier for the conversation thread.
   * @returns {Promise<object|null>} A promise that resolves to the checkpoint object if found, or `null` otherwise.
   * @property {number} v - The version of the checkpoint format (currently 1).
   * @property {string} ts - The timestamp of the checkpoint in ISO format.
   * @property {object} channel_values - The current values of the LangGraph channels.
   * @property {object} channel_versions - The versions of the LangGraph channels.
   * @property {object} versions_seen - The versions of nodes seen in the graph.
   */
  async get(config) {
    const thread_id = config.configurable.thread_id;
    if (!thread_id) {
      return null;
    }
    // Use the Mongoose model to find the document by its ID.
    const document = await CheckpointModel.findById(thread_id).lean();

    if (document) {
      console.log(`Checkpoint found for thread_id: ${thread_id}`);
      return {
        v: 1,
        ts: new Date(document.ts).toISOString(),
        channel_values: document.channel_values,
        channel_versions: document.channel_versions,
        versions_seen: document.versions_seen,
      };
    } else {
      console.log(`No checkpoint found for thread_id: ${thread_id}`);
      return null;
    }
  }

  /**
   * Saves or updates a checkpoint for a given thread ID in MongoDB.
   * If a document with the specified `thread_id` (used as `_id`) does not exist,
   * a new one will be created. Otherwise, the existing document will be updated.
   *
   * @param {object} config - The configuration object.
   * @param {string} config.configurable.thread_id - The unique identifier for the conversation thread.
   * @param {object} checkpoint - The checkpoint object to be saved.
   * @param {string} checkpoint.ts - The timestamp of the checkpoint.
   * @param {object} checkpoint.channel_values - The current values of the LangGraph channels.
   * @param {object} checkpoint.channel_versions - The versions of the LangGraph channels.
   * @param {object} checkpoint.versions_seen - The versions of nodes seen in the graph.
   * @returns {Promise<void>} A promise that resolves when the checkpoint has been saved or updated.
   */
  async put(config, checkpoint) {
    const thread_id = config.configurable.thread_id;
    if (!thread_id) {
      return;
    }
    console.log(`Saving checkpoint for thread_id: ${thread_id}`);

    const checkpointData = {
      ts: new Date(checkpoint.ts),
      channel_values: checkpoint.channel_values,
      channel_versions: checkpoint.channel_versions,
      versions_seen: checkpoint.versions_seen,
    };

    // Use findByIdAndUpdate with upsert: true. This will create the document
    // if it doesn't exist or update it if it does, all in one atomic operation.
    await CheckpointModel.findByIdAndUpdate(thread_id, checkpointData, {
      upsert: true,
      new: true, // Return the new document (optional)
    });
  }

  /**
   * Lists available checkpoints, optionally filtered by thread ID.
   * Returns an array of checkpoint metadata objects, each containing
   * configurable information, metadata, version, and timestamp.
   *
   * @param {object} config - The configuration object.
   * @param {string} [config.configurable.thread_id] - Optional unique identifier for the conversation thread to filter by.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of checkpoint metadata objects.
   * @property {object} configurable - The configurable part of the checkpoint, including `thread_id`.
   * @property {object} metadata - Additional metadata about the checkpoint source.
   * @property {number} v - The version of the checkpoint format.
   * @property {string} ts - The timestamp of the checkpoint in ISO format.
   */
  async list(config) {
    const thread_id = config.configurable.thread_id;
    const query = thread_id ? { _id: thread_id } : {};

    // Use the Mongoose model to find documents.
    const documents = await CheckpointModel.find(query).select('ts').lean();

    return documents.map((doc) => ({
      configurable: { thread_id: doc._id },
      metadata: { source: 'mongoose' },
      v: 1,
      ts: new Date(doc.ts).toISOString(),
    }));
  }
}