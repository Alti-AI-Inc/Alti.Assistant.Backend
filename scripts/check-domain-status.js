import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';

async function getDomainStatus(domain) {
  const auth = new GoogleAuth({
    keyFilename: 'alti_gcp.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  
  const projectId = 'alti-assistant-prod';
  const region = 'us-central1';
  const url = `https://${region}-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${projectId}/domainmappings/${domain}`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log(`\n========================================`);
    console.log(`STATUS FOR ${domain}:`);
    console.log(`========================================`);
    console.log(`Conditions:`, JSON.stringify(res.data.status?.conditions, null, 2));
    console.log(`Resource Records:`, JSON.stringify(res.data.status?.resourceRecords, null, 2));
  } catch (err) {
    if (err.response) {
      console.log(JSON.stringify(err.response.data, null, 2));
    } else {
      console.log(err.message);
    }
  }
}

async function run() {
  await getDomainStatus('altihq.com');
  await getDomainStatus('www.altihq.com');
}

run();
