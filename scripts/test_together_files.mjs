/**
 * Dedicated Test Suite for the Together.ai Files API (5 Endpoints)
 * References:
 * - https://docs.together.ai/reference/upload-file
 * - https://docs.together.ai/reference/get-files
 * - https://docs.together.ai/reference/get-files-id
 * - https://docs.together.ai/reference/get-files-id-content
 * - https://docs.together.ai/reference/delete-files-id
 * License: MIT
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  llmUploadFile,
  llmListFiles,
  llmGetFile,
  llmGetFileContent,
  llmDeleteFile,
} from '../src/app/services/llm.client.js';

import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';
import { inferenceRoutes } from '../src/app/modules/inference/inference.route.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

console.log('🧪 Testing Together.ai Files API Suite (5 Endpoints)...\n');

// Prepare temporary test file
const testFilePath = path.join(process.cwd(), 'temp_test_dataset.jsonl');
const testDatasetContent = JSON.stringify({ prompt: 'Hello world', completion: 'Hello!' }) + '\n';
fs.writeFileSync(testFilePath, testDatasetContent, 'utf-8');

try {
  // 1. POST /files & POST /files/upload (Upload File)
  console.log('[Test 1] Upload File (POST /files & POST /files/upload)...');
  const uploadedFile = await llmUploadFile(testFilePath, {
    purpose: 'fine-tune',
    file_name: 'test_dataset.jsonl',
    file_type: 'jsonl',
  });
  assert.ok(uploadedFile.id, 'Expected file ID');
  assert.strictEqual(uploadedFile.object, 'file');
  assert.strictEqual(uploadedFile.purpose, 'fine-tune');
  assert.ok(uploadedFile.bytes > 0, 'Expected positive byte count');
  console.log(`✅ Service: Uploaded file ID = ${uploadedFile.id} (${uploadedFile.bytes} bytes, filename = ${uploadedFile.filename})`);

  const resGatewayUpload = mockRes();
  await InferenceGateway.handleUploadFile(
    {
      file: {
        path: testFilePath,
        originalname: 'test_dataset.jsonl',
        size: Buffer.byteLength(testDatasetContent),
      },
      body: { purpose: 'fine-tune', file_name: 'test_dataset.jsonl' },
    },
    resGatewayUpload,
  );
  assert.strictEqual(resGatewayUpload.statusCode, 200);
  assert.ok(resGatewayUpload.body.id);
  assert.strictEqual(resGatewayUpload.body.object, 'file');
  console.log(`✅ Gateway: POST /files handled successfully.`);

  // 2. GET /files (List Files)
  console.log('\n[Test 2] List Files (GET /files)...');
  const fileList = await llmListFiles();
  assert.ok(Array.isArray(fileList.data), 'Expected data array in file list');
  assert.ok(fileList.data.length > 0, 'Expected at least 1 file in catalog');
  console.log(`✅ Service: Listed ${fileList.data.length} files (e.g. ${fileList.data[0].id})`);

  const resGatewayList = mockRes();
  await InferenceGateway.handleListFiles({ query: {} }, resGatewayList);
  assert.strictEqual(resGatewayList.statusCode, 200);
  assert.ok(Array.isArray(resGatewayList.body.data));
  console.log(`✅ Gateway: GET /files handled successfully.`);

  // 3. GET /files/:id (Retrieve File Metadata)
  console.log('\n[Test 3] Retrieve File Metadata (GET /files/:id)...');
  const testFileId = uploadedFile.id;
  const retrievedFile = await llmGetFile(testFileId);
  assert.strictEqual(retrievedFile.id, testFileId);
  assert.strictEqual(retrievedFile.object, 'file');
  assert.ok(retrievedFile.created_at);
  console.log(`✅ Service: Retrieved metadata for file ${testFileId} (purpose: ${retrievedFile.purpose})`);

  const resGatewayGet = mockRes();
  await InferenceGateway.handleGetFile({ params: { id: testFileId } }, resGatewayGet);
  assert.strictEqual(resGatewayGet.statusCode, 200);
  assert.strictEqual(resGatewayGet.body.id, testFileId);
  console.log(`✅ Gateway: GET /files/:id handled successfully.`);

  // 4. GET /files/:id/content (Retrieve File Content)
  console.log('\n[Test 4] Retrieve File Content (GET /files/:id/content)...');
  const fileContent = await llmGetFileContent(testFileId);
  assert.ok(fileContent && fileContent.length > 0, 'Expected non-empty file content');
  console.log(`✅ Service: Retrieved file content (${typeof fileContent === 'string' ? fileContent.length : JSON.stringify(fileContent).length} chars)`);

  const resGatewayContent = mockRes();
  await InferenceGateway.handleGetFileContent({ params: { id: testFileId } }, resGatewayContent);
  assert.strictEqual(resGatewayContent.statusCode, 200);
  assert.strictEqual(resGatewayContent.headers['Content-Type'], 'text/plain');
  assert.ok(resGatewayContent.body);
  console.log(`✅ Gateway: GET /files/:id/content handled successfully.`);

  // 5. DELETE /files/:id (Delete File)
  console.log('\n[Test 5] Delete File (DELETE /files/:id)...');
  const deleteResult = await llmDeleteFile(testFileId);
  assert.strictEqual(deleteResult.id, testFileId);
  assert.strictEqual(deleteResult.deleted, true);
  console.log(`✅ Service: Deleted file ${testFileId}`);

  const resGatewayDelete = mockRes();
  await InferenceGateway.handleDeleteFile({ params: { id: testFileId } }, resGatewayDelete);
  assert.strictEqual(resGatewayDelete.statusCode, 200);
  assert.strictEqual(resGatewayDelete.body.id, testFileId);
  assert.strictEqual(resGatewayDelete.body.deleted, true);
  console.log(`✅ Gateway: DELETE /files/:id handled successfully.`);

  // 6. Router Stack Verification
  console.log('\n[Test 6] Verifying Express Router Stack for File Paths...');
  const registeredRoutes = [];
  inferenceRoutes.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
      registeredRoutes.push(`${methods} ${layer.route.path}`);
    }
  });

  const requiredPaths = [
    'POST /files',
    'POST /v1/files',
    'POST /files/upload',
    'POST /v1/files/upload',
    'GET /files',
    'GET /v1/files',
    'GET /files/:id/content',
    'GET /v1/files/:id/content',
    'GET /files/:id',
    'GET /v1/files/:id',
    'DELETE /files/:id',
    'DELETE /v1/files/:id',
  ];

  requiredPaths.forEach((path) => {
    assert.ok(
      registeredRoutes.includes(path),
      `Missing route: ${path} in registered routes`,
    );
  });
  console.log(`✅ Router: All ${requiredPaths.length} required file paths registered properly in inferenceRoutes.`);

  console.log('\n🎉 ALL 5 TOGETHER.AI FILES ENDPOINTS VERIFIED & WORKING!\n');
} finally {
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
  }
}
