import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read GCP Service Account Key
const gcpKeyPath = path.join(__dirname, '../alti_gcp.json');
if (!fs.existsSync(gcpKeyPath)) {
  console.error(`ERROR: Service account key not found at: ${gcpKeyPath}`);
  process.exit(1);
}
const gcpKey = JSON.parse(fs.readFileSync(gcpKeyPath, 'utf8'));

// Read public keys we want to authorize
const pubKeys = [];
const keyPaths = [
  {
    name: 'alti-vm-key.pub',
    path: path.join(__dirname, '../../alti-vm-key.pub'),
  },
  {
    name: 'alti_deploy_key.pub',
    path: path.join(__dirname, '../../alti_deploy_key.pub'),
  },
];

for (const keyInfo of keyPaths) {
  if (fs.existsSync(keyInfo.path)) {
    const content = fs.readFileSync(keyInfo.path, 'utf8').trim();
    if (content) {
      pubKeys.push({ name: keyInfo.name, content });
      console.log(`Loaded public key: ${keyInfo.name}`);
    }
  } else {
    console.warn(`WARNING: Public key file not found: ${keyInfo.name}`);
  }
}

if (pubKeys.length === 0) {
  console.error('ERROR: No valid public keys loaded. Exiting.');
  process.exit(1);
}

// Prepare auth
const auth = new google.auth.GoogleAuth({
  credentials: gcpKey,
  scopes: ['https://www.googleapis.com/auth/compute'],
});

const compute = google.compute({
  version: 'v1',
  auth: auth,
});

async function main() {
  const project = gcpKey.project_id;
  const targetIp = '35.239.192.33';
  const username = 'emondarock';

  console.log(`\n========================================`);
  console.log(`Connecting to GCP Project: ${project}`);
  console.log(`Target VM IP: ${targetIp}`);
  console.log(`Authorized SSH User: ${username}`);
  console.log(`========================================\n`);

  // Scan all zones in the project for the Compute Instance
  console.log(`Scanning all project zones for instance with IP ${targetIp}...`);
  const res = await compute.instances.aggregatedList({
    project,
  });

  const zonesData = res.data.items || {};
  let targetInstance = null;
  let targetZone = null;

  for (const zoneName in zonesData) {
    const instances = zonesData[zoneName].instances || [];
    for (const instance of instances) {
      console.log(
        `- Discovered instance "${instance.name}" in zone ${zoneName.split('/').pop()} (Status: ${instance.status})`
      );
      const networkInterfaces = instance.networkInterfaces || [];
      for (const ni of networkInterfaces) {
        const accessConfigs = ni.accessConfigs || [];
        for (const ac of accessConfigs) {
          console.log(`  * External IP: ${ac.natIP}`);
          if (ac.natIP === targetIp) {
            targetInstance = instance;
            targetZone = zoneName.split('/').pop();
            break;
          }
        }
      }
      if (targetInstance) break;
    }
    if (targetInstance) break;
  }

  if (!targetInstance) {
    console.error(
      `\nERROR: Could not locate Compute Instance with Public IP ${targetIp} in any project zones. Please verify the VM is running and its IP is correct.`
    );
    process.exit(1);
  }

  console.log(
    `\nSUCCESS: Found VM "${targetInstance.name}" in zone: ${targetZone}`
  );

  // Fetch current VM metadata
  const currentMetadata = targetInstance.metadata || {};
  const currentItems = currentMetadata.items || [];

  // Find current 'ssh-keys' item
  let sshKeysItem = currentItems.find((item) => item.key === 'ssh-keys');
  let sshKeysValue = sshKeysItem ? sshKeysItem.value || '' : '';

  console.log('\nRetrieved current VM SSH Metadata keys count.');

  // Check which keys need to be added
  let keyAdded = false;
  let updatedSshKeysValue = sshKeysValue.trim();

  for (const pubKey of pubKeys) {
    const newSshKeyEntry = `${username}:${pubKey.content}`;

    if (sshKeysValue.includes(pubKey.content)) {
      console.log(`- Key "${pubKey.name}" is already authorized on this VM.`);
    } else {
      console.log(`- Adding key "${pubKey.name}" to authorization list...`);
      if (updatedSshKeysValue) {
        updatedSshKeysValue += '\n' + newSshKeyEntry;
      } else {
        updatedSshKeysValue = newSshKeyEntry;
      }
      keyAdded = true;
    }
  }

  if (!keyAdded) {
    console.log(
      '\nAll keys are already fully authorized in metadata. No update required.'
    );
    return;
  }

  // Build the updated metadata items list
  const updatedItems = currentItems.filter((item) => item.key !== 'ssh-keys');
  updatedItems.push({
    key: 'ssh-keys',
    value: updatedSshKeysValue,
  });

  console.log('\nSubmitting new metadata fingerprint to GCP...');
  const op = await compute.instances.setMetadata({
    project,
    zone: targetZone,
    instance: targetInstance.name,
    requestBody: {
      fingerprint: currentMetadata.fingerprint,
      items: updatedItems,
    },
  });

  console.log(
    `GCP metadata update operation initiated. Operation ID: ${op.data.id}`
  );
  console.log(
    'Successfully completed key injection! Please wait 10 seconds for the Google Guest Agent to synchronize permissions inside the VM...'
  );
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log('\nReady! VM SSH Key update fully completed.');
}

main().catch((error) => {
  console.error('\nFATAL ERROR executing metadata update:', error);
});
