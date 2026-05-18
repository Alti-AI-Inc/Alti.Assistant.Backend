/**
 * Test script for GCS upload functionality
 * Run with: node scripts/test-gcs-upload.js
 */

import {
  uploadPresentationToGCS,
  deleteFromGCS,
} from '../src/app/modules/presentation/services/gcsUploadService.js';
import { logger } from '../src/shared/logger.js';

// Test configuration
const TEST_CONFIG = {
  // Replace with actual Presenton API URL after generating a test presentation
  presentonUrl: 'http://localhost:5000/download/test123',
  fileName: 'test_presentation.pptx',
  userId: 'test_user_123',
  conversationId: 'test_conv_456',
};

async function testGCSUpload() {
  console.log('🧪 Testing GCS Upload Service...\n');

  try {
    // Test 1: Upload presentation
    console.log('📤 Test 1: Uploading presentation to GCS...');
    const uploadResult = await uploadPresentationToGCS(
      TEST_CONFIG.presentonUrl,
      TEST_CONFIG.fileName,
      TEST_CONFIG.userId,
      TEST_CONFIG.conversationId
    );

    console.log('✅ Upload successful!');
    console.log('📊 Upload Result:', JSON.stringify(uploadResult, null, 2));
    console.log('\n🔗 Public URL:', uploadResult.publicUrl);
    console.log('📁 GCS Path:', uploadResult.gcsPath);
    console.log('💾 File Size:', uploadResult.size, 'bytes');

    // Test 2: Verify public URL is accessible
    console.log('\n🔍 Test 2: Verifying public URL is accessible...');
    const response = await fetch(uploadResult.publicUrl);
    if (response.ok) {
      console.log('✅ Public URL is accessible!');
      console.log('📄 Content-Type:', response.headers.get('content-type'));
      console.log('💾 Content-Length:', response.headers.get('content-length'));
    } else {
      console.error('❌ Public URL is not accessible:', response.status);
    }

    // Test 3: Clean up (optional - comment out if you want to keep the test file)
    console.log('\n🧹 Test 3: Cleaning up test file...');
    const deleteSuccess = await deleteFromGCS(uploadResult.gcsPath);
    if (deleteSuccess) {
      console.log('✅ Test file deleted successfully!');
    } else {
      console.error('❌ Failed to delete test file');
    }

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
testGCSUpload()
  .then(() => {
    console.log('\n✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
