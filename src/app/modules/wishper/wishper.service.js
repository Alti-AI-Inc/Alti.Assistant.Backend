import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import config from '../../../../config/index.js'; // Adjust the path as necessary

const transcribeAudioToTextService = async (audioPath) => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioPath));
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${config.openai_secret_key}`,
      },
    }
  );

  return response.data.text;
};

export const whisperTranscribeService = {
  transcribeAudioToTextService,
};
