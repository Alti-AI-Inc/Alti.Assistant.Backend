import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';

async function main() {
  const credentialsPath = 'C:\\Users\\hyper\\AppData\\Roaming\\gcloud\\legacy_credentials\\inso-assistant-service@inso-assistant-prod.iam.gserviceaccount.com\\adc.json';
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  const tokenUrl = credentials.token_uri || 'https://oauth2.googleapis.com/token';

  // Calculate skew:
  const timeResponse = await axios.get('https://timeapi.io/api/time/current/zone?timeZone=UTC');
  const networkTime = new Date(timeResponse.data.dateTime + 'Z').getTime();
  const localTime = Date.now();
  const skewSeconds = Math.round((networkTime - localTime) / 1000);
  console.log(`Network Time: ${new Date(networkTime).toISOString()}`);
  console.log(`Local Time:   ${new Date(localTime).toISOString()}`);
  console.log(`Computed clock skew: ${skewSeconds} seconds`);

  // Set iat matching Google's server time
  const nowInSeconds = Math.floor(localTime / 1000) + skewSeconds;

  const payload = {
    iss: credentials.client_email,
    aud: tokenUrl,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    iat: nowInSeconds - 10, // give 10s grace
    exp: nowInSeconds + 3500 // expires in ~1 hour
  };

  const token = jwt.sign(payload, credentials.private_key, {
    algorithm: 'RS256',
    keyid: credentials.private_key_id
  });

  console.log('Sending assertion to Google OAuth token endpoint...');
  try {
    const response = await axios.post(tokenUrl, {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token
    });

    const accessToken = response.data.access_token;
    console.log('Successfully acquired access token!');
    
    // Save token to file
    fs.writeFileSync('../gcp_access_token.txt', accessToken, 'utf8');
    console.log('Access token saved to ../gcp_access_token.txt');
  } catch (error) {
    console.error('OAuth token exchange failed:');
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

main();
