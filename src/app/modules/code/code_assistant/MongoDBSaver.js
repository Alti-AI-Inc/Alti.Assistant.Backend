import mongoose from 'mongoose';
import { BaseCheckpointSaver } from '@langchain/langgraph';

// Define a Mongoose schema for the checkpoint document.
// This provides structure and validation for your data.
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
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Create a Mongoose model from the schema. This is our interface to the database collection.
const CheckpointModel = mongoose.model('Checkpoint', checkpointSchema);

/**
 * A custom checkpointer class that saves and loads LangGraph conversation
 * states to and from a MongoDB collection using Mongoose.
 */
export class MongoDBSaver extends BaseCheckpointSaver {
  constructor() {
    super(); // Pass a serializer to the parent class
  }

  static async fromUri(uri) {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(uri, { family: 4 });
      console.log('Successfully connected to MongoDB via Mongoose.');
    }
    return new MongoDBSaver();
  }

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
