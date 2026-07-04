import { Worker } from '@temporalio/worker';
import path from 'path';
import { fileURLToPath } from 'url';
import * as activities from './activities.js';
import { logger } from '../../../../../shared/logger.js';
import config from '../../../../../../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TemporalWorkerCoordinator {
  constructor() {
    this.worker = null;
    this.isRunning = false;
    this.isMock = false;
  }

  /**
   * Initializes and starts the background Temporal Worker polling insoai-workflows-queue
   */
  async start() {
    // Prevent multiple concurrent calls to start the worker.
    // If already running or in the process of starting, return.
    if (this.isRunning) {
      logger.info('[Temporal Worker] Worker service is already running.');
      return;
    }

    // Mark as running/starting immediately to prevent race conditions
    // if `start()` is called multiple times concurrently while initialization
    // (e.g., `await Worker.create()`) is in progress.
    this.isRunning = true;

    try {
      const address = config.temporal?.address || 'localhost:7233';
      const namespace = config.temporal?.namespace || 'default';
      
      // Standby / Mock check for local tests or offline environments
      if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test' || !config.temporal?.active) {
        logger.info('[Temporal Worker] System is operating in Offline/Test Mode. Starting Standby Mock Worker.');
        this.isMock = true; // Set mock flag
        // this.isRunning is already true from the start of the method.
        return; // Exit early for mock mode
      }

      logger.info(`[Temporal Worker] Initializing Worker connecting to cluster at ${address}...`);

      const workflowsPath = path.resolve(__dirname, './workflows.js');

      // Create the worker
      this.worker = await Worker.create({
        workflowsPath,
        activities,
        taskQueue: 'insoai-workflows-queue',
        connectionOptions: {
          address
        },
        namespace
      });

      // Worker successfully created, confirm it's a live worker.
      // this.isRunning is already true from the start of the method.
      this.isMock = false;

      // Run the worker asynchronously in the background so it doesn't block server boot.
      // Handle its lifecycle (clean exit or runtime errors).
      this.worker.run().then(() => {
        logger.info('[Temporal Worker] Worker run execution loop has cleanly exited.');
        this.isRunning = false; // Worker has stopped cleanly
      }).catch((err) => {
        logger.error(`[Temporal Worker] Runtime error in execution loop: ${err.message}`);
        this.isRunning = false; // Worker has stopped due to an error
        this._activateMockFallback(); // Attempt to fall back to mock mode
      });

      logger.info('[Temporal Worker] Resilient Temporal Worker successfully started and polling: "insoai-workflows-queue".');
    } catch (error) {
      logger.warn(`[Temporal Worker] Could not connect to live Temporal cluster: ${error.message}. Entering Standby Emulation Mode.`);
      // If Worker.create fails, the live worker could not be established.
      // The _activateMockFallback() method will set this.isMock = true and ensure
      // this.isRunning remains true for the mock worker.
      this._activateMockFallback();
    }
  }

  /**
   * Shuts down the polling worker cleanly
   */
  async stop() {
    if (!this.isRunning) return;

    if (this.isMock) {
      logger.info('[Temporal Worker] Standby Mock Worker stopped.');
      this.isRunning = false;
      return;
    }

    logger.info('[Temporal Worker] Initiating graceful shutdown of polling worker...');
    try {
      if (this.worker) {
        await this.worker.shutdown();
      }
      this.isRunning = false;
      logger.info('[Temporal Worker] Polling worker successfully shut down.');
    } catch (err) {
      logger.error(`[Temporal Worker] Error during worker shutdown: ${err.message}`);
      this.isRunning = false;
    }
  }

  /**
   * Activates fallback emulated mode to support zero-crash VM boots
   * @private
   */
  _activateMockFallback() {
    this.isMock = true;
    this.isRunning = true; // Ensure isRunning is true when in mock mode
    logger.info('[Temporal Worker] Safe Mock Standby Mode is active. Workflows will execute under client-side emulation.');
  }
}

export const temporalWorkerCoordinator = new TemporalWorkerCoordinator();