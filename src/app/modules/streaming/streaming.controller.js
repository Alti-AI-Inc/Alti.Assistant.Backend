const httpStatus = require('http-status');
const { sendResponse } = require('../../../shared/sendResponse');
const { catchAsync } = require('../../../shared/catchAsync');
// const { AccessToken } = require('livekit-server-sdk');
const { livekit_secret_key, livekit_api_key } = require('../../../../config');
const { logger } = require('../../../shared/logger');


const generateRandomParticipantName = (length) => {
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * alphabets.length);
        result += alphabets[randomIndex];
    }
    return result;
}




module.exports.authStreamingController = catchAsync(async (req, res) => {
    const { AccessToken } = await import('livekit-server-sdk');
    // if this room doesn't exist, it'll be automatically created when the first client joins
    const roomName = 'ason-ai-room';
    // identifier to be used for participant.
    // it's available as LocalParticipant.identity with livekit-client SDK

    const participantName = generateRandomParticipantName(8);

    logger.info(participantName, 'participantName participantName')
    const at = new AccessToken(livekit_api_key, livekit_secret_key, {
        identity: participantName,
        // token to expire after 10 minutes
        ttl: '60m',
    });
    at.addGrant({ roomJoin: true, room: roomName });


    const result = await at.toJwt();
    logger.info(result, 'resulttttttttt')
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Generate auth token for streaming',
        data: result,
    });
});
