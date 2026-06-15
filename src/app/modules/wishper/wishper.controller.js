import fs from 'fs';
import httpStatus from 'http-status';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../../../shared/redis.js'; // Assumes a configured ioredis client is exported from here
import { whisperTranscribeService } from './wishper.service.js';

// const WishperAiGetResponse = catchAsync(async (req, res) => {
//   const userId = req.body?.user;
//   const sessionId = req.body?.sessionId || randomUUID();

//   // Check for missing audio file in the form-data
//   const audioFilePath = req.file?.path;  // Use req.file instead of req.body?.audioFile
//   if (!audioFilePath) {
//     return sendResponse(res, {
//       statusCode: httpStatus.BAD_REQUEST,
//       success: false,
//       message: 'Audio file is missing.',
//     });
//   }

//   const user = await UserModel.findById(userId);

//   if (!user) {
//     return sendResponse(res, {
//       statusCode: httpStatus.NOT_FOUND,
//       success: false,
//       message: 'User not found.',
//     });
//   }

//   // Preparing form data for the API call
//   const formData = new FormData();
//   formData.append('file', fs.createReadStream(audioFilePath));
//   formData.append('model', 'whisper-large-v3'); // Groq supports whisper-compatible models
//   formData.append('language', 'en'); // Optional

//   try {
//     const response = await axios.post(
//       'https://api.groq.com/v1/audio/transcriptions',
//       formData,
//       {
//         headers: {
//           ...formData.getHeaders(),
//           Authorization: `Bearer ${config.groq_api_key}`,
//         },
//       }
//     );

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Response processed successfully.',
//       data: { sessionId, response },
//     });
//   } catch (error) {
//     console.error('Error in Gemini AI:', error);
//     sendResponse(res, {
//       statusCode: httpStatus.INTERNAL_SERVER_ERROR,
//       success: false,
//       message: 'Failed to get response',
//       error: error.message,
//     });
//   }
// });

// const WishperAiGetResponse = catchAsync(async (req, res) => {
//   const userId = req.body?.user;
//   const sessionId = req.body?.sessionId || randomUUID();

//   const s3Url = req.file?.location;
//   if (!s3Url) {
//     return sendResponse(res, {
//       statusCode: httpStatus.BAD_REQUEST,
//       success: false,
//       message: 'Audio file is missing.',
//     });
//   }

//   const user = await UserModel.findById(userId);
//   if (!user) {
//     return sendResponse(res, {
//       statusCode: httpStatus.NOT_FOUND,
//       success: false,
//       message: 'User not found.',
//     });
//   }

//   // Download the file from S3 to a temporary file
//   const tmpFile = await tmp.file();
//   const writer = createWriteStream(tmpFile.path);
//   const audioResponse = await axios.get(s3Url, { responseType: 'stream' });
//   audioResponse.data.pipe(writer);

//   await new Promise((resolve, reject) => {
//     writer.on('finish', resolve);
//     writer.on('error', reject);
//   });

//   const formData = new FormData();
//   formData.append('file', fs.createReadStream(tmpFile.path));
//   // formData.append('model', 'whisper-large-v3');
//   formData.append('model', 'whisper-1');
//   formData.append('language', 'en');
//   const stats = fs.statSync(tmpFile.path);
//   console.log('📦 File size (bytes):', stats.size);
//   try {
//     const response = await axios.post(
//       'https://api.openai.com/v1/audio/transcriptions',
//       formData,
//       {
//         headers: {
//           ...formData.getHeaders(),
//           Authorization: `Bearer ${config.openai_secret_key}`, // Must be OpenAI key
//         },
//       },
//     );

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Response processed successfully.',
//       data: { sessionId, response: response.data },
//     });
//   } catch (error) {
//    console.log(error.response.data);
//     sendResponse(res, {
//       statusCode: httpStatus.INTERNAL_SERVER_ERROR,
//       success: false,
//       message: 'Failed to get response',
//       error: error?.response?.data || error.message,
//     });
//   } finally {
//     // Clean up the temporary file
//     await tmpFile.cleanup();
//   }
// });

// Enterprise-grade rate limiter for the Whisper AI transcription endpoint.
// This is a critical defense against API abuse, DDOS attacks, and cost overruns
// from the underlying paid AI service. It uses a Redis store for scalability
// across multiple application instances.
const transcribeAudioLimiter = rateLimit({
  // Use Redis for distributed rate limiting.
  store: new RedisStore({
    // @ts-expect-error - ioredis types can be incompatible with express-rate-limit
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: 1 * 60 * 1000, // 1 minute window.
  limit: 15, // Limit each user (or IP if unauthenticated) to 15 requests per minute.
  standardHeaders: 'draft-7', // Send standard `RateLimit-*` headers.
  legacyHeaders: false, // Disable legacy `X-RateLimit-*` headers.
  keyGenerator: (req /*, res*/) => {
    // Prioritize the authenticated user's ID for rate limiting.
    // Fall back to the request IP address for unauthenticated requests.
    // This ensures fair usage per user and provides a baseline protection for public access.
    return req.user?.id || req.ip;
  },
  handler: (req, res, _next, options) => {
    // Log the event for security monitoring and threat analysis.
    console.warn(
      `Rate limit exceeded for Whisper transcription: user=${req.user?.id || 'unauthenticated'}, ip=${req.ip}`
    );
    // Send a JSON response consistent with the API's error format.
    res.status(options.statusCode).json({
      success: false,
      message: `Too many transcription requests. ${options.message}`,
    });
  },
  message: 'Please try again in a minute.',
});

const transcribeAudioToTextController = async (req, res) => {
  const audioFilePath = req.file?.path;

  if (!audioFilePath) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'No audio file uploaded.',
    });
  }

  try {
    const text =
      await whisperTranscribeService.transcribeAudioToTextService(
        audioFilePath
      );

    // Optimize: Replaced synchronous fs.unlinkSync with asynchronous fs.promises.unlink
    // to prevent blocking the event loop during file deletion.
    // Added specific error handling for 'ENOENT' (file not found) to avoid unnecessary warnings.
    try {
      await fs.promises.unlink(audioFilePath);
    } catch (unlinkError) {
      if (unlinkError.code !== 'ENOENT') {
        console.warn(`Failed to delete temporary audio file ${audioFilePath}:`, unlinkError.message);
      }
    }

    return res.status(httpStatus.OK).json({
      success: true,
      transcription: text,
    });
  } catch (error) {
    // Optimize: Replaced synchronous fs.unlinkSync with asynchronous fs.promises.unlink
    // to prevent blocking the event loop during file deletion, even on error.
    // Added specific error handling for 'ENOENT' (file not found) to avoid unnecessary warnings.
    try {
      await fs.promises.unlink(audioFilePath);
    } catch (unlinkError) {
      if (unlinkError.code !== 'ENOENT') {
        console.warn(`Failed to delete temporary audio file ${audioFilePath} during error handling:`, unlinkError.message);
      }
    }

    console.error(
      'Whisper transcription failed:',
      error.response?.data || error.message
    );

    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Transcription failed',
      error: error.response?.data || error.message,
    });
  }
};

export const WishperAiController = {
  // WishperAiGetResponse,
  // The controller is now exported as an array containing the rate-limiting middleware
  // and the controller function. This ensures the rate limiter is always applied.
  // The router should apply this using the spread operator: router.post('/', ...WishperAiController.transcribeAudioToTextController);
  transcribeAudioToTextController: [
    transcribeAudioLimiter,
    transcribeAudioToTextController,
  ],
};