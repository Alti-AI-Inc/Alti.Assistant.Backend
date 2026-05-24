import { BaseCheckpointSaver } from '@langchain/langgraph';
import WorkflowCheckpoint from '../models/workflowCheckpoint.model.js';
import { logger } from '../../../../shared/logger.js';

/**
 * A production-grade MongoDB checkpointer for LangGraph JS.
 * Fulfills Phase 1 of our master workflow automation plan.
 */
export class MongoDBSaver extends BaseCheckpointSaver {
  /**
   * Retrieves a checkpoint tuple from the database.
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
   * Saves a checkpoint tuple to the database.
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
   * Lists checkpoints matching the criteria.
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
