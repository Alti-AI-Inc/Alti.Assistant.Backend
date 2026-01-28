import express from 'express';
import audioUploader from '../../middlewares/uploder/uploadAudio.js';
import { WishperAiController } from './wishper.controller.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
const router = express.Router();

// const uploader = audioUploader({
//   folder: 'audio',
//   acl: 'public-read',
//   supportedExtensions: /\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i,
//   maxFileSize: 10 * 1024 * 1024,
// });

// router.post(
//   '/get-response',
//   uploader.single('file'),
//   WishperAiController.WishperAiGetResponse,
// );

// router.post('/whisper-transcribe', audioUploader.single('file'), async (req, res) => {
//   const audioFilePath = req.file?.path;

//   if (!audioFilePath) {
//     return res.status(400).json({ success: false, message: 'No audio file uploaded.' });
//   }

//   const formData = new FormData();
//   formData.append('file', fs.createReadStream(audioFilePath));
//   formData.append('model', 'whisper-1');
//   formData.append('language', 'en');

//   try {
//     const response = await axios.post(
//       'https://api.openai.com/v1/audio/transcriptions',
//       formData,
//       {
//         headers: {
//           ...formData.getHeaders(),
//           Authorization: `Bearer ${config.openai_secret_key}`,
//         },
//       }
//     );

//     // Optional: Delete local file after use
//     fs.unlinkSync(audioFilePath);

//     res.status(200).json({
//       success: true,
//       transcription: response.data.text,
//     });
//   } catch (error) {
//     fs.unlinkSync(audioFilePath); // cleanup even on error

//     console.error('Whisper transcription failed:', error.response?.data || error.message);
//     res.status(500).json({
//       success: false,
//       message: 'Transcription failed',
//       error: error.response?.data || error.message,
//     });
//   }
// });

router.post(
  '/whisper-transcribe',
  audioUploader.single('file'),
  WishperAiController.transcribeAudioToTextController,
);

export const wishperAiRoutes = router;
