/**
 * @file This file contains the controller for handling streaming-related authentication.
 * It provides functionality to generate authentication tokens for LiveKit streaming sessions.
 */

import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const { livekit_secret_key, livekit_api_key } = config;

/**
 * Generates a random participant name of a specified length using uppercase alphabets.
 *
 * @param {number} length - The desired length of the participant name.
 * @returns {string} A randomly generated participant name.
 */
const generateRandomParticipantName = (length) => {
  const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * alphabets.length);
    result += alphabets[randomIndex];
  }
  return result;
};

/**
 * @swagger
 * /api/v1/streaming/auth:
 *   post:
 *     summary: Generate an authentication token for LiveKit streaming.
 *     description: Generates a JWT token for a participant to join a LiveKit streaming room.
 *                  The room name is fixed as 'insoai-ai-room', and a random participant name is generated.
 *                  The token is valid for 60 minutes.
 *     tags:
 *       - Streaming
 *     responses:
 *       201:
 *         description: Successfully generated the authentication token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Generate auth token for streaming
 *                 data:
 *                   type: string
 *                   description: The generated JWT token for LiveKit.
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller function to generate an authentication token for LiveKit streaming.
 * It creates a new LiveKit AccessToken with a randomly generated participant identity
 * and grants permission to join a predefined room ('insoai-ai-room').
 * The token is set to expire after 60 minutes.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const authStreamingController = catchAsync(async (req, res) => {
  const { AccessToken } = await import('livekit-server-sdk');
  // if this room doesn't exist, it'll be automatically created when the first client joins
  const roomName = 'insoai-ai-room';
  // identifier to be used for participant.
  // it's available as LocalParticipant.identity with livekit-client SDK

  const participantName = generateRandomParticipantName(8);

  logger.info(participantName, 'participantName participantName');
  const at = new AccessToken(livekit_api_key, livekit_secret_key, {
    identity: participantName,
    // token to expire after 10 minutes
    ttl: '60m',
  });
  at.addGrant({ roomJoin: true, room: roomName });

  const result = await at.toJwt();
  logger.info(result, 'resulttttttttt');
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Generate auth token for streaming',
    data: result,
  });
});