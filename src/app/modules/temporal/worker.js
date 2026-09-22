import { Worker } from '@temporalio/worker';
import * as activities from './activities.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runTemporalWorker() {
  const address = config.temporal?.address || 'localhost:7233';
  const namespace = config.temporal?.namespace || 'default';

  try {
    // Determine if we are running in dev (JS) or built (compiled to JS anyway since this is a Node project)
    const workflowsPath = path.join(__dirname, 'workflows.js');

    const worker = await Worker.create({
      workflowsPath,
      activities,
      taskQueue: 'inso-tasks',
      connectionOptions: {
        address
      },
      namespace,
    });

    logger.info(`[Temporal Worker] Connected to ${address}, listening on queue 'inso-tasks'`);
    
    // Start worker in the background
    worker.run().catch((err) => {
      logger.error(`[Temporal Worker] Worker crashed: ${err.message}`);
    });
    
    return worker;
  } catch (err) {
    logger.warn(`[Temporal Worker] Failed to start worker: ${err.message}. Assuming local cluster is down.`);
    return null;
  }
}
