import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

const testKeyFile = async (keyPath) => {
  try {
    console.log(`\n🔑 Testing key file: ${keyPath}`);
    if (!fs.existsSync(keyPath)) {
      console.log(`❌ Key file does not exist at: ${keyPath}`);
      return false;
    }

    // Initialize GoogleAuth
    const auth = new GoogleAuth({
      keyFilename: keyPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    console.log('🔄 Requesting GCP access token...');
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    
    if (!accessToken) {
      console.log('❌ Failed to obtain GCP access token');
      return false;
    }
    console.log('🟢 Access token obtained successfully!');

    console.log('🔄 Pinging Google Cloud Speech-to-Text API...');
    
    // Construct a minimal dummy payload
    const requestBody = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      },
      audio: {
        content: 'dGVzdA==' // dummy base64 data
      }
    };

    const response = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();
    console.log('Response Status:', response.status);
    console.log('Response JSON:', JSON.stringify(responseData, null, 2));

    if (response.status === 200 || (responseData.error && responseData.error.message.includes('audio'))) {
      console.log(`🎉 SUCCESS! The key ${keyPath} is active and authenticated correctly.`);
      return true;
    } else {
      console.log(`❌ Unexpected API response for key ${keyPath}:`, responseData.error?.message || responseData);
      return false;
    }
  } catch (error) {
    console.error(`❌ Verification failed for ${keyPath}:`, error.message);
    return false;
  }
};

const verifyAll = async () => {
  const rootKey = path.join(process.cwd(), '../gcp-sa-key.json');
  const backendKey = path.join(process.cwd(), 'alti_gcp.json');
  
  await testKeyFile(rootKey);
  await testKeyFile(backendKey);
};

verifyAll();
