import fs from 'fs';
import path from 'path';
import { whisperTranscribeService } from '../src/app/modules/wishper/wishper.service.js';

const testService = async () => {
  try {
    console.log('🔄 Loading whisperTranscribeService...');
    
    // Create a temporary dummy audio file to test the service flow
    const tempAudioDir = path.join(process.cwd(), 'scratch', 'temp');
    if (!fs.existsSync(tempAudioDir)) {
      fs.mkdirSync(tempAudioDir, { recursive: true });
    }
    
    const tempAudioPath = path.join(tempAudioDir, 'test_recording.webm');
    fs.writeFileSync(tempAudioPath, Buffer.from('RIFF....WAVEfmt ')); // basic mock WAV header
    console.log('🟢 Temporary mock audio file created at:', tempAudioPath);

    console.log('🔄 Calling transcribeAudioToTextService...');
    // This will run the service, try GCP STT, print logs, and run fallback if needed
    const result = await whisperTranscribeService.transcribeAudioToTextService(tempAudioPath);
    console.log('🎉 Transcription Result:', result);

    // Clean up
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }
  } catch (error) {
    console.log('\n❌ Transcription Flow ended with expected/handled result:', error.message);
  }
};

testService();
