import { Connection, Client } from '@temporalio/client';
import { runDurableWorkflow } from './workflows.js';
import { logger } from '../../../../../shared/logger.js';
import config from '../../../../../../config/index.js';

class TemporalClientCoordinator {
  constructor() {
    this.client = null;
    this.connection = null;
    this.isMock = false;
    this.connectionPromise = null; // Added to prevent race conditions during connection
  }

  /**
   * Connect to the Temporal cluster
   */
  async connect() {
    // If a connection attempt is already in progress, await it.
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Start a new connection attempt and store its promise
    this.connectionPromise = (async () => {
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
        return this.client; // Return the client on successful connection
      } catch (error) {
        logger.warn(`[Temporal Client] Live Temporal connection failed: ${error.message}. Initializing Offline Mock Client.`);
        this.isMock = true;
        this.client = this._createMockClient();
        return this.client; // Return the mock client on failure
      } finally {
        // Clear the promise once the connection attempt (success or failure) is complete.
        // This allows for future reconnection attempts if needed.
        this.connectionPromise = null; 
      }
    })();

    return this.connectionPromise; // Return the promise for the current connection attempt
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
    // Ensure the client is connected before starting a workflow.
    // This will await an ongoing connection or initiate a new one if not connected.
    if (!this.client) {
      await this.connect();
    }

    const workflowId = `wf-${workflow._id || 'temp'}-${Date.now()}`;
    logger.info(`[Temporal Client] Starting durable workflow ${workflowId} (Mock: ${this.isMock})`);

    let handle;
    if (this.isMock) {
      handle = await this.client.workflow.start(runDurableWorkflow, {
        args: [workflow, userId, context, options.startStepIndex || 0],
        workflowId
      });
      return {
        success: true,
        workflowId,
        isMock: true,
        handle
      };
    } else {
      handle = await this.client.workflow.start(runDurableWorkflow, {
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