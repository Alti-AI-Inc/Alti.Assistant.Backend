import fs from 'fs';
import { whisperTranscribeService } from './wishper.service.js';
import httpStatus from 'http-status';

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

    // Safe delete
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }

    return res.status(httpStatus.OK).json({
      success: true,
      transcription: text,
    });
  } catch (error) {
    // Safe delete on error
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
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
  transcribeAudioToTextController,
};
