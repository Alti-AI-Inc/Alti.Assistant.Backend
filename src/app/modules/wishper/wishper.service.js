import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mp3';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/m4a';
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    default: return 'audio/mp3'; // Fallback
  }
};

const transcribeAudioToTextService = async (audioPath) => {
  try {
    const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const audioBuffer = fs.readFileSync(audioPath);
    const mimeType = getMimeType(audioPath);

    const audioPart = {
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType: mimeType
      }
    };

    const prompt = 'Please transcribe this audio into plain, accurate text. Output ONLY the transcription, with no conversational additions or filler.';

    const result = await model.generateContent([prompt, audioPart]);
    return result?.response?.text() || '';
  } catch (error) {
    console.error('Error during Gemini audio transcription:', error);
    throw error;
  }
};

export const whisperTranscribeService = {
  transcribeAudioToTextService,
};
