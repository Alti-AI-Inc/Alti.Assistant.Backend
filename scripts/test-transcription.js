import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

// Configuration
const BASE_URL = 'http://localhost:5000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

/**
 * Test 1: Simple transcription
 */
async function testSimpleTranscription() {
  console.log('\n📝 Test 1: Simple Transcription');
  console.log('=================================');

  try {
    // Create a test audio file path (you'll need to provide a real audio file)
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found at:', audioFilePath);
      console.log('Please add a sample.mp3 file to test/data/ directory');
      return;
    }

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    formData.append('processingType', 'transcribe');
    formData.append('includeTimestamps', 'false');

    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log('✅ Success!');
    console.log('Conversation ID:', response.data.data.conversationId);
    console.log('Result:', response.data.data.result.substring(0, 200) + '...');
    console.log('Token Count:', response.data.data.metadata.tokenCount);
    console.log(
      'Duration:',
      response.data.data.metadata.estimatedDuration,
      'seconds'
    );
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 2: Describe audio
 */
async function testDescribeAudio() {
  console.log('\n🎵 Test 2: Describe Audio');
  console.log('=================================');

  try {
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found');
      return;
    }

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    formData.append('processingType', 'describe');
    formData.append(
      'prompt',
      'Describe all sounds, music, and speech in this audio'
    );

    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log('✅ Success!');
    console.log('Description:', response.data.data.result);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 3: Segment analysis with timestamps
 */
async function testSegmentAnalysis() {
  console.log('\n⏱️  Test 3: Segment Analysis');
  console.log('=================================');

  try {
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found');
      return;
    }

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    formData.append('processingType', 'transcribe');
    formData.append('startTimestamp', '00:10');
    formData.append('endTimestamp', '00:30');
    formData.append('prompt', 'Transcribe this specific segment');

    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log('✅ Success!');
    console.log('Segment (00:10 - 00:30):', response.data.data.result);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 4: Inline audio processing
 */
async function testInlineAudio() {
  console.log('\n📦 Test 4: Inline Audio Processing');
  console.log('=================================');

  try {
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found');
      return;
    }

    // Read audio file and convert to base64
    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioBase64 = audioBuffer.toString('base64');

    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe/inline`,
      {
        audioData: audioBase64,
        mimeType: 'audio/mp3',
        processingType: 'summarize',
        prompt: 'Provide a brief summary',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log('✅ Success!');
    console.log('Summary:', response.data.data.result);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 5: Get statistics
 */
async function testGetStats() {
  console.log('\n📊 Test 5: Get Transcription Statistics');
  console.log('=================================');

  try {
    const response = await axios.get(`${BASE_URL}/transcription/stats`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    console.log('✅ Success!');
    console.log('Statistics:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 6: Analyze audio content
 */
async function testAnalyzeAudio() {
  console.log('\n🔍 Test 6: Analyze Audio');
  console.log('=================================');

  try {
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found');
      return;
    }

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    formData.append('processingType', 'analyze');
    formData.append('prompt', 'Identify the main themes, speakers, and tone');

    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log('✅ Success!');
    console.log('Analysis:', response.data.data.result);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Test 7: Guest user access
 */
async function testGuestAccess() {
  console.log('\n👤 Test 7: Guest User Access');
  console.log('=================================');

  try {
    const audioFilePath = path.join(
      process.cwd(),
      'test',
      'data',
      'sample.mp3'
    );

    if (!fs.existsSync(audioFilePath)) {
      console.log('⚠️  No test audio file found');
      return;
    }

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    formData.append('processingType', 'transcribe');

    // No authorization header - guest access
    const response = await axios.post(
      `${BASE_URL}/transcription/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      }
    );

    console.log('✅ Success! Guest access works');
    console.log('Result:', response.data.data.result.substring(0, 100) + '...');
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Transcription Module Tests');
  console.log('======================================');
  console.log('Base URL:', BASE_URL);
  console.log('API Key:', API_KEY ? '***' + API_KEY.slice(-4) : 'Not set');

  // Check if test audio directory exists
  const testDataDir = path.join(process.cwd(), 'test', 'data');
  if (!fs.existsSync(testDataDir)) {
    console.log('\n⚠️  Creating test/data directory...');
    fs.mkdirSync(testDataDir, { recursive: true });
    console.log(
      '✅ Directory created. Please add a sample.mp3 file to test/data/'
    );
  }

  // Run tests
  await testSimpleTranscription();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testDescribeAudio();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testSegmentAnalysis();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testInlineAudio();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testAnalyzeAudio();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testGuestAccess();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testGetStats();

  console.log('\n✅ All tests completed!');
}

// Run the tests
runTests().catch(console.error);
