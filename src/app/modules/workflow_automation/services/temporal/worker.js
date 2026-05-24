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
   * Initializes and starts the background Temporal Worker polling alti-workflows-queue
   */
  async start() {
    if (this.isRunning) {
      logger.info('[Temporal Worker] Worker service is already running.');
      return;
    }

    try {
      const address = config.temporal?.address || 'localhost:7233';
      const namespace = config.temporal?.namespace || 'default';
      
      // Standby / Mock check for local tests or offline environments
      if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test' || !config.temporal?.active) {
        logger.info('[Temporal Worker] System is operating in Offline/Test Mode. Starting Standby Mock Worker.');
        this.isMock = true;
        this.isRunning = true;
        return;
      }

      logger.info(`[Temporal Worker] Initializing Worker connecting to cluster at ${address}...`);

      const workflowsPath = path.resolve(__dirname, './workflows.js');

      // Create the worker
      this.worker = await Worker.create({
        workflowsPath,
        activities,
        taskQueue: 'alti-workflows-queue',
        connectionOptions: {
          address
        },
        namespace
      });

      this.isRunning = true;
      this.isMock = false;

      // Run the worker asynchronously in the background so it doesn't block server boot
      this.worker.run().then(() => {
        logger.info('[Temporal Worker] Worker run execution loop has cleanly exited.');
        this.isRunning = false;
      }).catch((err) => {
        logger.error(`[Temporal Worker] Runtime error in execution loop: ${err.message}`);
        this.isRunning = false;
        this._activateMockFallback();
      });

      logger.info('[Temporal Worker] Resilient Temporal Worker successfully started and polling: "alti-workflows-queue".');
    } catch (error) {
      logger.warn(`[Temporal Worker] Could not connect to live Temporal cluster: ${error.message}. Entering Standby Emulation Mode.`);
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
    }
  }

  /**
   * Activates fallback emulated mode to support zero-crash VM boots
   * @private
   */
  _activateMockFallback() {
    this.isMock = true;
    this.isRunning = true;
    logger.info('[Temporal Worker] Safe Mock Standby Mode is active. Workflows will execute under client-side emulation.');
  }
}

export const temporalWorkerCoordinator = new TemporalWorkerCoordinator();
