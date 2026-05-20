import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';

async function deleteAndCreateDomain(domain) {
  const auth = new GoogleAuth({
    keyFilename: 'alti_gcp.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  
  const projectId = 'alti-assistant-prod';
  const region = 'us-central1';
  const deleteUrl = `https://${region}-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${projectId}/domainmappings/${domain}`;
  const createUrl = `https://${region}-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${projectId}/domainmappings`;
  
  // 1. Delete existing if any
  console.log(`Deleting existing domain mapping for ${domain}...`);
  try {
    await axios.delete(deleteUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log(`Successfully deleted old mapping for ${domain}. Waiting 5 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (err) {
    console.log(`No existing mapping to delete or delete failed: ${err.message}`);
  }
  
  // 2. Create new mapping
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
  
  console.log(`Re-creating domain mapping for ${domain}...`);
  try {
    const res = await axios.post(createUrl, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`SUCCESS re-creating ${domain}!`);
  } catch (err) {
    if (err.response) {
      console.log(`FAILED re-creating ${domain}:`, JSON.stringify(err.response.data, null, 2));
    } else {
      console.log(`FAILED re-creating ${domain}:`, err.message);
    }
  }
}

async function run() {
  await deleteAndCreateDomain('altihq.com');
  await deleteAndCreateDomain('www.altihq.com');
}

run();
