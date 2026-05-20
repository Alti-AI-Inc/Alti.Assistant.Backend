import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';

async function mapDomain(domain) {
  const auth = new GoogleAuth({
    keyFilename: 'alti_gcp.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  
  const projectId = 'alti-assistant-prod';
  const region = 'us-central1';
  const url = `https://${region}-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${projectId}/domainmappings`;
  
  const body = {
    apiVersion: 'domains.cloudrun.com/v1',
    kind: 'DomainMapping',
    metadata: {
      name: domain,
      namespace: projectId
    },
    spec: {
      routeName: 'alti-assistant-frontend'
    }
  };
  
  console.log(`Sending domain mapping request for ${domain}...`);
  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`\n========================================`);
    console.log(`SUCCESS mapping ${domain}!`);
    console.log(`========================================`);
    console.log(`Resource Status:`, JSON.stringify(res.data.status, null, 2));
  } catch (err) {
    console.log(`\n========================================`);
    console.log(`FAILED mapping ${domain}:`);
    console.log(`========================================`);
    if (err.response) {
      console.log(JSON.stringify(err.response.data, null, 2));
    } else {
      console.log(err.message);
    }
  }
}

async function run() {
  await mapDomain('altihq.com');
  await mapDomain('www.altihq.com');
}

run();
