import { Connection, Client } from '@temporalio/client';
import { runDurableWorkflow } from './workflows.js';
import { logger } from '../../../../../shared/logger.js';
import config from '../../../../../../config/index.js';

class TemporalClientCoordinator {
  constructor() {
    this.client = null;
    this.connection = null;
    this.isMock = false;
  }

  /**
   * Connect to the Temporal cluster
   */
  async connect() {
    try {
      const address = config.temporal?.address || 'localhost:7233';
      logger.info(`[Temporal Client] Connecting to Temporal Service at ${address}...`);
      
      // Force offline mock in test or local offline environment to prevent connection timeouts
      if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test' || !config.temporal?.active) {
        throw new Error('Local offline/test environment mode is active.');
      }

      this.connection = await Connection.connect({ address });
      this.client = new Client({
        connection: this.connection,
        namespace: config.temporal?.namespace || 'default',
      });
      logger.info('[Temporal Client] Connected successfully to Temporal Service.');
    } catch (error) {
      logger.warn(`[Temporal Client] Live Temporal connection failed: ${error.message}. Initializing Offline Mock Client.`);
      this.isMock = true;
      this.client = this._createMockClient();
    }
  }

  /**
   * Durably start a workflow execution
   * @param {object} workflow - Full workflow document
   * @param {string} userId - User identifier
   * @param {object} context - Workflow variables
   * @param {object} options - Start configurations (e.g., startStepIndex)
   * @returns {Promise<object>} Start report
   */
  async startWorkflow(workflow, userId, context = {}, options = {}) {
    if (!this.client) {
      await this.connect();
    }

    const workflowId = `wf-${workflow._id || 'temp'}-${Date.now()}`;
    logger.info(`[Temporal Client] Starting durable workflow ${workflowId} (Mock: ${this.isMock})`);

    if (this.isMock) {
      const handle = await this.client.workflow.start(runDurableWorkflow, {
        args: [workflow, userId, context, options.startStepIndex || 0],
        workflowId
      });
      return {
        success: true,
        workflowId,
        isMock: true,
        handle
      };
    }

    const handle = await this.client.workflow.start(runDurableWorkflow, {
      args: [workflow, userId, context, options.startStepIndex || 0],
      taskQueue: 'alti-workflows-queue',
      workflowId
    });

    return {
      success: true,
      workflowId,
      isMock: false,
      handle
    };
  }

  /**
   * Internal mock client generator for local/test validation
   * @private
   */
  _createMockClient() {
    return {
      workflow: {
        start: async (workflowFn, options) => {
          logger.info(`[Mock Temporal Client] Emulating workflow execution launch for ID: ${options.workflowId}`);
          
          // Execute the workflow function directly to simulate standard Temporal Worker activity polling
          const promise = workflowFn(...options.args);
          
          return {
            workflowId: options.workflowId,
            result: async () => await promise
          };
        }
      }
    };
  }
}

export const temporalClientCoordinator = new TemporalClientCoordinator();
