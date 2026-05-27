import fs from 'fs';
import path from 'path';

// Set environment variables to use backend's alti_gcp.json
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(process.cwd(), 'alti_gcp.json');

const test = async () => {
  console.log('Starting Google Cloud Speech-to-Text Test with newly overwritten alti_gcp.json...');
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    console.log('🟢 Access token acquired successfully:', tokenResponse.token ? 'YES' : 'NO');
    console.log('Project ID:', client.projectId);
  } catch (err) {
    console.error('❌ Authentication failed:', err);
  }
};

test();
