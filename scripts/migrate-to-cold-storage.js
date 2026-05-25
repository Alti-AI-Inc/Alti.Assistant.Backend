import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import path from 'path';
import config from '../config/index.js';

// Load environment variables
dotenv.config();

console.log('\n======================================================================');
console.log('🌙 GCP DATASET COLD STORAGE MIGRATION UTILITY');
console.log('======================================================================');

const keyPath = config.google.google_application_credentials || path.join(process.cwd(), 'alti_gcp.json');
const storage = new Storage({ keyFilename: keyPath });
const bucketName = config.gcs.knowledge_bank_bucket || 'alti_assistant_datasets';
const bucket = storage.bucket(bucketName);

async function migrate() {
  try {
    console.log(`🔌 Initializing GCS Storage connection...`);
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) {
      console.error(`❌ Bucket "${bucketName}" does not exist. No files to migrate.`);
      process.exit(0);
    }

    console.log(`🔍 Scanning all objects under prefix "datasets/" in bucket "${bucketName}"...`);
    const [files] = await bucket.getFiles({ prefix: 'datasets/' });

    if (files.length === 0) {
      console.log('✅ No dataset files found on GCS. Migration is complete (already zero files).');
      process.exit(0);
    }

    console.log(`📦 Found ${files.length} files to migrate to ARCHIVE storage class...`);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    let totalBytesTransitioned = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const metadata = file.metadata;
      const size = Number(metadata.size || 0);

      // Check if already in ARCHIVE class
      if (metadata.storageClass === 'ARCHIVE') {
        console.log(`[${i + 1}/${files.length}] ℹ️  ${file.name} is already in ARCHIVE storage class. Skipping.`);
        skipCount++;
        continue;
      }

      try {
        console.log(`[${i + 1}/${files.length}] ❄️  Migrating ${file.name} (${(size / (1024 * 1024)).toFixed(2)} MB) to ARCHIVE class...`);
        
        await file.setMetadata({
          storageClass: 'ARCHIVE'
        });

        successCount++;
        totalBytesTransitioned += size;
      } catch (err) {
        console.error(`[${i + 1}/${files.length}] ❌ Failed to migrate ${file.name}:`, err.message);
        failCount++;
      }
    }

    console.log('\n======================================================================');
    console.log('🎉 MIGRATION COMPLETED SUMMARY');
    console.log('======================================================================');
    console.log(`  - Successfully Migrated : ${successCount} files`);
    console.log(`  - Already in Archive    : ${skipCount} files`);
    console.log(`  - Failed to Migrate     : ${failCount} files`);
    console.log(`  - Total Data Cold-Stored: ${(totalBytesTransitioned / (1024 * 1024)).toFixed(2)} MB (${(totalBytesTransitioned / (1024 * 1024 * 1024)).toFixed(3)} GB)`);
    console.log('======================================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Critical Migration Failure:', error.message);
    process.exit(1);
  }
}

migrate();
