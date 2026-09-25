/**
 * Test Suite for Together.ai Deployments Storage & Volumes (6 Endpoints)
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. POST /deployments/storage/volumes (Create volume)
 * 2. GET /deployments/storage/volumes (List volumes)
 * 3. GET /deployments/storage/volumes/:id (Retrieve volume)
 * 4. PATCH /deployments/storage/volumes/:id (Update volume)
 * 5. DELETE /deployments/storage/volumes/:id (Delete volume)
 * 6. GET /deployments/storage/:filename (Download storage file / signed URL)
 */
import assert from 'assert';
import {
  llmCreateDeploymentVolume,
  llmListDeploymentVolumes,
  llmGetDeploymentVolume,
  llmUpdateDeploymentVolume,
  llmDeleteDeploymentVolume,
  llmGetDeploymentStorageFile,
} from '../src/app/services/llm.client.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import router from '../src/app/modules/inference/inference.route.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    redirectUrl: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
}

async function runDeploymentStorageTestSuite() {
  console.log('🧪 Testing Together.ai Deployments Storage & Volumes Suite (6 Endpoints)...\n');

  // 1. POST /deployments/storage/volumes (Create volume)
  console.log('[Test 1] Create Deployment Volume (POST /deployments/storage/volumes)...');
  const createPayload = {
    name: 'test-sovereign-model-weights',
    type: 'readOnly',
    content: {
      source_type: 'huggingFace',
      hf_repo_id: 'meta-llama/Meta-Llama-3.1-8B',
    },
  };

  const createdVol = await llmCreateDeploymentVolume(createPayload);
  assert.ok(createdVol.id, 'Created volume must have an id');
  assert.strictEqual(createdVol.object, 'volume');
  assert.strictEqual(createdVol.type, 'readOnly');
  console.log(`✅ Service: Created volume ID = ${createdVol.id} (name: ${createdVol.name})`);

  const testVolId = createdVol.id;

  const resGatewayCreate = mockRes();
  await InferenceGateway.handleCreateDeploymentVolume({ body: createPayload }, resGatewayCreate);
  assert.strictEqual(resGatewayCreate.statusCode, 200);
  assert.ok(resGatewayCreate.body.id);
  assert.strictEqual(resGatewayCreate.body.object, 'volume');
  console.log(`✅ Gateway: POST /deployments/storage/volumes handled successfully.`);

  // 2. GET /deployments/storage/volumes (List volumes)
  console.log('\n[Test 2] List Deployment Volumes (GET /deployments/storage/volumes)...');
  const listedVols = await llmListDeploymentVolumes({});
  assert.strictEqual(listedVols.object, 'list');
  assert.ok(Array.isArray(listedVols.data), 'Listed volumes must contain data array');
  assert.ok(listedVols.data.length > 0, 'Should return at least 1 volume');
  console.log(`✅ Service: Listed ${listedVols.data.length} volumes (e.g. ${listedVols.data[0].id || listedVols.data[0].name})`);

  const resGatewayList = mockRes();
  await InferenceGateway.handleListDeploymentVolumes({ query: {} }, resGatewayList);
  assert.strictEqual(resGatewayList.statusCode, 200);
  assert.strictEqual(resGatewayList.body.object, 'list');
  assert.ok(Array.isArray(resGatewayList.body.data));
  console.log(`✅ Gateway: GET /deployments/storage/volumes handled successfully.`);

  // 3. GET /deployments/storage/volumes/:id (Retrieve volume)
  console.log('\n[Test 3] Retrieve Deployment Volume (GET /deployments/storage/volumes/:id)...');
  const retrievedVol = await llmGetDeploymentVolume(testVolId);
  assert.strictEqual(retrievedVol.id, testVolId);
  assert.strictEqual(retrievedVol.object, 'volume');
  console.log(`✅ Service: Retrieved volume ${testVolId} (name: ${retrievedVol.name})`);

  const resGatewayGet = mockRes();
  await InferenceGateway.handleGetDeploymentVolume({ params: { id: testVolId } }, resGatewayGet);
  assert.strictEqual(resGatewayGet.statusCode, 200);
  assert.strictEqual(resGatewayGet.body.id, testVolId);
  console.log(`✅ Gateway: GET /deployments/storage/volumes/:id handled successfully.`);

  // 4. PATCH /deployments/storage/volumes/:id (Update volume)
  console.log('\n[Test 4] Update Deployment Volume (PATCH /deployments/storage/volumes/:id)...');
  const updatePayload = {
    content: {
      source_type: 'huggingFace',
      hf_repo_id: 'meta-llama/Meta-Llama-3.1-70B',
    },
  };
  const updatedVol = await llmUpdateDeploymentVolume(testVolId, updatePayload);
  assert.strictEqual(updatedVol.id, testVolId);
  assert.strictEqual(updatedVol.object, 'volume');
  console.log(`✅ Service: Updated volume ${testVolId}`);

  const resGatewayUpdate = mockRes();
  await InferenceGateway.handleUpdateDeploymentVolume(
    { params: { id: testVolId }, body: updatePayload },
    resGatewayUpdate,
  );
  assert.strictEqual(resGatewayUpdate.statusCode, 200);
  assert.strictEqual(resGatewayUpdate.body.id, testVolId);
  console.log(`✅ Gateway: PATCH /deployments/storage/volumes/:id handled successfully.`);

  // 5. DELETE /deployments/storage/volumes/:id (Delete volume)
  console.log('\n[Test 5] Delete Deployment Volume (DELETE /deployments/storage/volumes/:id)...');
  const deletedVol = await llmDeleteDeploymentVolume(testVolId);
  assert.ok(deletedVol.deleted === true || deletedVol.id === testVolId);
  console.log(`✅ Service: Deleted volume ${testVolId}`);

  const resGatewayDelete = mockRes();
  await InferenceGateway.handleDeleteDeploymentVolume({ params: { id: testVolId } }, resGatewayDelete);
  assert.strictEqual(resGatewayDelete.statusCode, 200);
  assert.ok(resGatewayDelete.body.deleted === true || resGatewayDelete.body.id === testVolId);
  console.log(`✅ Gateway: DELETE /deployments/storage/volumes/:id handled successfully.`);

  // 6. GET /deployments/storage/:filename (Download storage file / signed URL)
  console.log('\n[Test 6] Download Deployment Storage File (GET /deployments/storage/:filename)...');
  const testFilename = 'model-weights-v1.tar.gz';
  const fileData = await llmGetDeploymentStorageFile(testFilename);
  assert.ok(fileData.url, 'Must return signed URL');
  assert.strictEqual(fileData.filename, testFilename);
  console.log(`✅ Service: Retrieved storage file download URL for ${testFilename} (url: ${fileData.url})`);

  const resGatewayFile = mockRes();
  await InferenceGateway.handleGetDeploymentStorageFile(
    { params: { filename: testFilename }, query: {}, headers: { accept: 'application/json' } },
    resGatewayFile,
  );
  assert.strictEqual(resGatewayFile.statusCode, 200);
  assert.strictEqual(resGatewayFile.body.filename, testFilename);
  console.log(`✅ Gateway: GET /deployments/storage/:filename handled successfully.`);

  // 7. Router Stack Verification
  console.log('\n[Test 7] Verifying Express Router Stack for Storage and Volumes Paths...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/deployments/storage/volumes', method: 'GET' },
    { path: '/v1/deployments/storage/volumes', method: 'GET' },
    { path: '/deployments/storage/volumes', method: 'POST' },
    { path: '/v1/deployments/storage/volumes', method: 'POST' },
    { path: '/deployments/storage/volumes/:id', method: 'GET' },
    { path: '/v1/deployments/storage/volumes/:id', method: 'GET' },
    { path: '/deployments/storage/volumes/:id', method: 'PATCH' },
    { path: '/v1/deployments/storage/volumes/:id', method: 'PATCH' },
    { path: '/deployments/storage/volumes/:id', method: 'PUT' },
    { path: '/v1/deployments/storage/volumes/:id', method: 'PUT' },
    { path: '/deployments/storage/volumes/:id', method: 'POST' },
    { path: '/v1/deployments/storage/volumes/:id', method: 'POST' },
    { path: '/deployments/storage/volumes/:id', method: 'DELETE' },
    { path: '/v1/deployments/storage/volumes/:id', method: 'DELETE' },
    { path: '/deployments/storage/:filename', method: 'GET' },
    { path: '/v1/deployments/storage/:filename', method: 'GET' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: All ${requiredRoutes.length} required storage and volume routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 ALL 6 TOGETHER.AI DEPLOYMENTS STORAGE & VOLUMES ENDPOINTS VERIFIED & WORKING!\n');
}

runDeploymentStorageTestSuite().catch((err) => {
  console.error('❌ Deployment Storage Test Suite Failed:', err);
  process.exit(1);
});
