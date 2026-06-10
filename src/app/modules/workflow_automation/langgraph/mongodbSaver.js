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
 *
 * OPTIMIZATION NOTE:
 * For maximum query performance, ensure the following indexes are created on the WorkflowCheckpoint collection:
 * 1. { threadId: 1, checkpointId: 1 } (Unique index)
 * 2. { threadId: 1, createdAt: -1 }
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
      // Optimize query payload by projecting only the required fields
      const projection = { checkpointId: 1, checkpointStr: 1, metadataStr: 1 };

      if (checkpoint_id) {
        // Optimized with .lean() and projection to bypass Mongoose hydration and minimize payload size
        doc = await WorkflowCheckpoint.findOne(
          {
            threadId: thread_id,
            checkpointId: checkpoint_id,
          },
          projection
        ).lean();
      } else {
        // Retrieve the latest checkpoint based on creation time.
        // Optimized to findOne with sort, projection, and .lean() instead of find().limit(1)
        doc = await WorkflowCheckpoint.findOne(
          {
            threadId: thread_id,
          },
          projection
        )
          .sort({ createdAt: -1 })
          .lean();
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
            // If the model uses Mongoose timestamps, 'updatedAt' would be handled automatically.
            // If not, and an 'updatedAt' field is desired, it would be set here.
          },
          // Set 'createdAt' only when a new document is inserted (upsert: true creates a new doc if not found).
          // This ensures 'createdAt' reflects the actual creation time of the checkpoint,
          // which is crucial for chronological sorting in getTuple and list methods.
          $setOnInsert: {
            createdAt: new Date(),
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

      // If 'before' checkpoint_id is provided, find its creation timestamp
      // to filter for checkpoints truly "older than" it chronologically.
      if (before?.configurable?.checkpoint_id) {
        // Optimized with .lean() and projection to minimize memory and CPU overhead
        const beforeDoc = await WorkflowCheckpoint.findOne(
          {
            threadId: thread_id, // Ensure scoping to the current thread for security and correctness
            checkpointId: before.configurable.checkpoint_id,
          },
          { createdAt: 1 } // Only project the 'createdAt' field to minimize data transfer
        ).lean();

        if (beforeDoc?.createdAt) {
          query.createdAt = { $lt: beforeDoc.createdAt };
        }
        // If beforeDoc is not found or has no createdAt, the 'before' filter is effectively ignored,
        // which is a reasonable default behavior rather than throwing an error or returning no results.
      }

      // Sort by 'createdAt' in descending order to list the newest checkpoints first.
      // Optimized with .lean() and projection to avoid hydrating Mongoose documents and minimize payload size.
      // Uses a cursor to stream documents instead of loading all matching checkpoints into memory at once.
      let queryBuilder = WorkflowCheckpoint.find(
        query,
        { checkpointId: 1, checkpointStr: 1, metadataStr: 1 }
      )
        .sort({ createdAt: -1 })
        .lean();

      if (limit !== undefined) {
        queryBuilder = queryBuilder.limit(limit);
      }

      const cursor = queryBuilder.cursor();
      for await (const doc of cursor) {
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