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

    // Groq Whisper-large-v3 fallback
    const groqKey = process.env.GROQ_API_KEY || config.groq_api_key;
    if (groqKey) {
      console.log('🔄 Gemini transcription failed. Falling back to Groq Whisper-large-v3...');
      try {
        const audioBuffer = fs.readFileSync(audioPath);
        const mimeType = getMimeType(audioPath);

        const fileBlob = new Blob([audioBuffer], { type: mimeType });
        const formData = new FormData();
        formData.append('file', fileBlob, path.basename(audioPath));
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'en');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
          },
          body: formData,
        });

        const responseData = await response.json();
        if (response.ok && responseData.text) {
          console.log('🟢 Groq Whisper fallback transcription succeeded!');
          return responseData.text;
        } else {
          console.error(
            '❌ Groq Whisper fallback failed:',
            responseData.error?.message || responseData
          );
        }
      } catch (fallbackError) {
        console.error('❌ Groq Whisper fallback error:', fallbackError.message);
      }
    }

    throw error;
  }
};

export const whisperTranscribeService = {
  transcribeAudioToTextService,
};
