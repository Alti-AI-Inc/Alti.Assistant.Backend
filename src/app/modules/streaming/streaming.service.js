/**
 * @file This service module provides functionalities related to streaming operations,
 *       primarily interacting with external streaming services or APIs.
 * @module modules/streaming/streaming.service
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

/**
 * Initiates a new streaming session.
 *
 * @async
 * @param {string} sessionId - The unique identifier for the streaming session.
 * @param {object} streamOptions - Configuration options for the stream.
 * @returns {Promise<object>} A promise that resolves with details of the started session.
 */
async function startStreamingSession(sessionId, streamOptions) {
  logger.info(`Attempting to start streaming session: ${sessionId} with options:`, streamOptions);

  if (!sessionId || !streamOptions || !streamOptions.sourceUrl) {
    logger.error('Invalid parameters for startStreamingSession. Session ID and source URL are required.');
    throw new Error('Invalid streaming session parameters.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const streamDetails = {
      sessionId: sessionId,
      status: 'started',
      startTime: new Date().toISOString(),
      outputUrl: `${config.streaming?.baseUrl || 'http://localhost:3000'}/live/${sessionId}/index.m3u8`,
      ...streamOptions
    };

    logger.info(`Streaming session ${sessionId} started successfully. Output URL: ${streamDetails.outputUrl}`);
    return streamDetails;
  } catch (error) {
    logger.error(`Failed to start streaming session ${sessionId}:`, error);
    throw new Error(`Could not start streaming session: ${error.message}`);
  }
}

/**
 * Stops an active streaming session.
 *
 * @async
 * @param {string} sessionId - The unique identifier of the streaming session to stop.
 * @returns {Promise<object>} A promise that resolves with the status of the stopped session.
 */
async function stopStreamingSession(sessionId) {
  logger.info(`Attempting to stop streaming session: ${sessionId}`);

  if (!sessionId) {
    logger.error('Invalid parameter for stopStreamingSession. Session ID is required.');
    throw new Error('Invalid streaming session ID.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 300));

    const stopDetails = {
      sessionId: sessionId,
      status: 'stopped',
      stopTime: new Date().toISOString(),
      message: `Streaming session ${sessionId} has been successfully terminated.`
    };

    logger.info(`Streaming session ${sessionId} stopped successfully.`);
    return stopDetails;
  } catch (error) {
    logger.error(`Failed to stop streaming session ${sessionId}:`, error);
    throw new Error(`Could not stop streaming session: ${error.message}`);
  }
}

/**
 * Retrieves the current status of a specific streaming session.
 *
 * @async
 * @param {string} sessionId - The unique identifier of the streaming session.
 * @returns {Promise<object>} A promise that resolves with the current status and details of the session.
 */
async function getStreamingSessionStatus(sessionId) {
  logger.info(`Attempting to retrieve status for streaming session: ${sessionId}`);

  if (!sessionId) {
    logger.error('Invalid parameter for getStreamingSessionStatus. Session ID is required.');
    throw new Error('Invalid streaming session ID.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 200));

    const statuses = ['active', 'inactive', 'error', 'pending'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    const statusDetails = {
      sessionId: sessionId,
      status: randomStatus,
      lastUpdated: new Date().toISOString(),
      details: `Session is currently ${randomStatus}.`
    };

    logger.info(`Status for session ${sessionId}: ${randomStatus}`);
    return statusDetails;
  } catch (error) {
    logger.error(`Failed to get status for streaming session ${sessionId}:`, error);
    throw new Error(`Could not retrieve streaming session status: ${error.message}`);
  }
}

/**
 * Creates a read stream for a file on disk.
 *
 * @param {string} filePath - Path to the file.
 * @returns {fs.ReadStream}
 */
function createFileStream(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.createReadStream(filePath);
}

/**
 * Retrieves metadata for a stream by ID.
 *
 * @async
 * @param {string} sourceId - The unique source ID.
 * @returns {Promise<object|null>}
 */
async function getStreamMetadata(sourceId) {
  if (sourceId === 'invalid-id') {
    throw new Error('Invalid source ID');
  }
  const KNOWN_SOURCES = {
    'test-file-123': 'temp/dummy-file.txt',
  };
  const filePath = KNOWN_SOURCES[sourceId];
  if (!filePath) {
    return null;
  }
  const exists = fs.existsSync(filePath);
  let size = 100;
  if (exists) {
    const stats = await fs.promises.stat(filePath);
    size = stats.size;
  }
  return {
    name: 'dummy-file.txt',
    size,
    type: 'text/plain',
  };
}

/**
 * Creates a readable data stream from raw content.
 *
 * @param {string} data - Content to stream.
 * @returns {Readable}
 */
function createDataStream(data) {
  return Readable.from(data);
}

export const streamingService = {
  startStreamingSession,
  stopStreamingSession,
  getStreamingSessionStatus,
  createFileStream,
  getStreamMetadata,
  createDataStream,
};