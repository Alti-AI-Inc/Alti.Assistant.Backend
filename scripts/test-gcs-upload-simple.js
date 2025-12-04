/**
 * Simple test for GCS upload function
 * Usage: node scripts/test-gcs-upload-simple.js
 */

import { uploadPresentationToGCS } from '../src/app/modules/presentation/services/gcsUploadService.js';

async function testUpload() {
  try {
    // Test parameters - adjust these for your test
    const presentationPath = `/app_data/exports/Artificial Intelligence Shaping Our Future    An Exploration of AI's Impact and Potential    Un.pptx`; // Path from Presenton API
    const fileName = 'test_presentation.pptx';
    const userId = 'test_user_123';
    const conversationId = 'test_conv_456';

    console.log('Testing GCS upload...');
    console.log('Path:', presentationPath);
    console.log('File:', fileName);
    console.log('User:', userId);
    console.log('Conversation:', conversationId);
    console.log('---');

    const uploadResult = await uploadPresentationToGCS(
      presentationPath,
      fileName,
      userId,
      conversationId
    );

    console.log('✅ Upload successful!');
    console.log('Public URL:', uploadResult.publicUrl);
    console.log('GCS Path:', uploadResult.gcsPath);
    console.log('Bucket:', uploadResult.bucket);
    console.log('Size:', uploadResult.size, 'bytes');

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    console.error(error.stack);
  }
}

testUpload();
