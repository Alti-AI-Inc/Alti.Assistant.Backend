/**
 * @file This file defines the API routes for Whisper AI functionalities.
 * @module app/modules/wishper/wishper.route
 * @author Your Name/Organization
 */

import express from 'express';
import audioUploader from '../../middlewares/uploder/uploadAudio.js';
import { WishperAiController } from './wishper.controller.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

/**
 * Express router to handle Whisper AI related routes.
 * @type {express.Router}
 */
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

/**
 * @swagger
 * /api/v1/whisper-transcribe:
 *   post:
 *     summary: Transcribe audio to text using Whisper AI
 *     description: Uploads an audio file and sends it to the Whisper AI for transcription, returning the transcribed text.
 *     tags:
 *       - Whisper AI
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The audio file to be transcribed. Supported formats include FLAC, M4A, MP3, MP4, MPEG, MPGA, OGA, OGG, WAV, WEBM.
 *             required:
 *               - file
 *     responses:
 *       200:
 *         description: Audio successfully transcribed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transcription:
 *                   type: string
 *                   example: "This is a transcription of the uploaded audio file."
 *       400:
 *         description: Bad Request - No audio file uploaded or invalid file type.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No audio file uploaded."
 *       500:
 *         description: Internal Server Error - Transcription failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Transcription failed"
 *                 error:
 *                   type: string
 *                   example: "Error details from the Whisper AI service."
 */
router.post(
  '/whisper-transcribe',
  audioUploader.single('file'),
  WishperAiController.transcribeAudioToTextController
);

/**
 * Exports the Express router for Whisper AI routes.
 * @type {express.Router}
 */
export const wishperAiRoutes = router;