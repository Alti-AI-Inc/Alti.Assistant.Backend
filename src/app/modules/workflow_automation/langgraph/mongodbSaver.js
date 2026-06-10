import { BaseCheckpointSaver } from '@langchain/langgraph';
import WorkflowCheckpoint from '../models/workflowCheckpoint.model.js';
import { logger } from '../../../../shared/logger.js';

/**
 * A production-grade MongoDB checkpointer for LangGraph JS.
 * Fulfills Phase 1 of our master workflow automation plan.
 *
 * This class extends `BaseCheckpointSaver` from `@langchain/langgraph`
 * to provide persistent storage for LangGraph checkpoints using MongoDB.
 * It serializes and deserializes checkpoint data and metadata using the
 * `serde` utility provided by the base class.
 */
export class MongoDBSaver extends BaseCheckpointSaver {
  /**
   * Retrieves a checkpoint tuple from the database based on the provided configuration.
   * If `checkpoint_id` is specified, it retrieves that specific checkpoint.
   * If `checkpoint_id` is not specified, it retrieves the latest checkpoint for the given `thread_id`.
   *
   * @param {Object} config - The configuration object for the checkpoint retrieval.
   * @param {Object} config.configurable - Configurable properties for the checkpoint.
   * @param {string} config.configurable.thread_id - The unique identifier for the thread whose checkpoint is to be retrieved.
   * @param {string} [config.configurable.checkpoint_id] - The specific ID of the checkpoint to retrieve. If omitted, the latest checkpoint for the thread will be fetched.
   * @returns {Promise<Object|undefined>} A promise that resolves to the checkpoint tuple (containing config, checkpoint, and metadata)
   *                                      or `undefined` if no matching checkpoint is found.
   * @throws {Error} If a database error occurs during the retrieval process.
   */
  async getTuple(config) {
    try {
      const thread_id = config.configurable?.thread_id;
      const checkpoint_id = config.configurable?.checkpoint_id;

      if (!thread_id) {
        return undefined;
      }

      let doc;
      if (checkpoint_id) {
        doc = await WorkflowCheckpoint.findOne({
          threadId: thread_id,
          checkpointId: checkpoint_id,
        });
      } else {
        // Retrieve the latest checkpoint
        const docs = await WorkflowCheckpoint.find({
          threadId: thread_id,
        })
          .sort({ checkpointId: -1 })
          .limit(1);
        doc = docs[0];
      }

      if (!doc) {
        return undefined;
      }

      return {
        config: {
          configurable: {
            thread_id,
            checkpoint_id: doc.checkpointId,
          },
        },
        checkpoint: await this.serde.parse(doc.checkpointStr),
        metadata: await this.serde.parse(doc.metadataStr),
      };
    } catch (error) {
      logger.error('Error in MongoDBSaver.getTuple:', error);
      throw error;
    }
  }

  /**
   * Saves a checkpoint tuple (checkpoint and its associated metadata) to the database.
   * If a checkpoint with the given `threadId` and `checkpointId` already exists, it will be updated.
   * Otherwise, a new checkpoint document will be created.
   *
   * @param {Object} config - The configuration object for the checkpoint.
   * @param {Object} config.configurable - Configurable properties for the checkpoint.
   * @param {string} config.configurable.thread_id - The unique identifier for the thread to which the checkpoint belongs.
   * @param {Object} checkpoint - The checkpoint object to be saved. This object must contain an `id` property.
   * @param {Object} metadata - The metadata object associated with the checkpoint.
   * @returns {Promise<Object>} A promise that resolves to the configuration object of the saved checkpoint,
   *                             including its `thread_id` and `checkpoint_id`.
   * @throws {Error} If `thread_id` is missing in the config or if a database error occurs during the save operation.
   */
  async put(config, checkpoint, metadata) {
    try {
      const thread_id = config.configurable?.thread_id;
      if (!thread_id) {
        throw new Error('thread_id is required in config to persist checkpoint');
      }

      const checkpointId = checkpoint.id;
      const checkpointStr = this.serde.stringify(checkpoint);
      const metadataStr = this.serde.stringify(metadata);

      await WorkflowCheckpoint.updateOne(
        { threadId: thread_id, checkpointId },
        {
          $set: {
            checkpointStr,
            metadataStr,
          },
        },
        { upsert: true }
      );

      return {
        configurable: {
          thread_id,
          checkpoint_id: checkpointId,
        },
      };
    } catch (error) {
      logger.error('Error in MongoDBSaver.put:', error);
      throw error;
    }
  }

  /**
   * Lists checkpoints matching the specified criteria, yielding them one by one.
   * This method supports filtering by `thread_id`, limiting the number of results,
   * and retrieving checkpoints older than a specific `checkpoint_id`.
   *
   * @param {Object} config - The configuration object for filtering checkpoints.
   * @param {Object} config.configurable - Configurable properties for the checkpoint.
   * @param {string} config.configurable.thread_id - The unique identifier for the thread whose checkpoints are to be listed.
   * @param {number} [limit] - The maximum number of checkpoints to return. If not provided, all matching checkpoints will be returned.
   * @param {Object} [before] - An optional configuration object to list checkpoints older than a specific checkpoint.
   * @param {Object} [before.configurable] - Configurable properties for the `before` checkpoint.
   * @param {string} [before.configurable.checkpoint_id] - The checkpoint ID to list checkpoints that are older than this ID.
   * @yields {Promise<Object>} A promise that yields checkpoint tuples (config, checkpoint, metadata) matching the criteria.
   * @throws {Error} If a database error occurs during the listing process.
   */
  async *list(config, limit, before) {
    try {
      const thread_id = config.configurable?.thread_id;
      if (!thread_id) {
        return;
      }

      const query = { threadId: thread_id };
      if (before?.configurable?.checkpoint_id) {
        query.checkpointId = { $lt: before.configurable.checkpoint_id };
      }

      let cursor = WorkflowCheckpoint.find(query).sort({ checkpointId: -1 });
      if (limit !== undefined) {
        cursor = cursor.limit(limit);
      }

      const docs = await cursor.exec();
      for (const doc of docs) {
        yield {
          config: {
            configurable: {
              thread_id,
              checkpoint_id: doc.checkpointId,
            },
          },
          checkpoint: await this.serde.parse(doc.checkpointStr),
          metadata: await this.serde.parse(doc.metadataStr),
        };
      }
    } catch (error) {
      logger.error('Error in MongoDBSaver.list:', error);
      throw error;
    }
  }
}