import { JWT } from 'google-auth-library';
import fs from 'fs';

async function main() {
  const credentials = JSON.parse(fs.readFileSync('./alti_gcp.json', 'utf8'));
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  try {
    console.log('Requesting access token using google-auth-library...');
    const tokens = await client.authorize();
    console.log('Access token acquired successfully!');
    console.log(tokens.access_token.substring(0, 15) + '...');
    
    // Save to file
    fs.writeFileSync('../gcp_access_token.txt', tokens.access_token, 'utf8');
    console.log('Access token saved to ../gcp_access_token.txt');
  } catch (error) {
    console.error('Failed to authorize:', error);
  }
}

main();
