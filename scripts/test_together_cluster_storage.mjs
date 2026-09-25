/**
 * Dedicated Test Suite for the Together.ai Cluster Storage & Regions API Suite (6 Endpoints)
 * References:
 * - https://docs.together.ai/reference/clusters_storages-create
 * - https://docs.together.ai/reference/clusters_storages-list
 * - https://docs.together.ai/reference/clusters_storages-get
 * - https://docs.together.ai/reference/clusters_storages-update
 * - https://docs.together.ai/reference/clusters_storages-delete
 * - https://docs.together.ai/reference/clusters-list-regions
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateClusterStorage,
  llmListClusterStorages,
  llmGetClusterStorage,
  llmUpdateClusterStorage,
  llmDeleteClusterStorage,
  llmListClusterRegions,
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
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

console.log('🧪 Testing Together.ai Cluster Storage & Regions Suite (6 Endpoints)...\n');

// 1. POST /compute/clusters/storage/volumes (Create Shared Storage Volume)
console.log('[Test 1] Create Shared Volume (POST /compute/clusters/storage/volumes)...');
const storagePayload = {
  volume_name: 'aphura-checkpoint-storage',
  size_tib: 4,
  region: 'sovereign-liberty-1',
};
const createdVolume = await llmCreateClusterStorage(storagePayload);
assert.ok(createdVolume.id || createdVolume.volume_id, 'Expected volume ID');
assert.ok(createdVolume.volume_name, 'Expected volume name');
assert.strictEqual(Number(createdVolume.size_tib), 4);
const testVolumeId = createdVolume.id || createdVolume.volume_id;
console.log(`✅ Service: Created shared volume ID = ${testVolumeId} (${createdVolume.size_tib} TiB, region: ${createdVolume.region})`);

const resGatewayCreate = mockRes();
await InferenceGateway.handleCreateClusterStorage({ body: storagePayload }, resGatewayCreate);
assert.strictEqual(resGatewayCreate.statusCode, 200);
assert.ok(resGatewayCreate.body.id || resGatewayCreate.body.volume_id);
console.log(`✅ Gateway: POST /compute/clusters/storage/volumes handled successfully.`);

// 2. GET /compute/clusters/storage/volumes (List Shared Volumes)
console.log('\n[Test 2] List Shared Volumes (GET /compute/clusters/storage/volumes)...');
const storageList = await llmListClusterStorages();
const volumesArray = storageList.volumes || storageList.data || storageList;
assert.ok(Array.isArray(volumesArray), 'Expected array in volumes list');
assert.ok(volumesArray.length > 0, 'Expected at least 1 volume in catalog');
console.log(`✅ Service: Listed ${volumesArray.length} volumes (e.g. ${volumesArray[0].id || volumesArray[0].volume_id})`);

const resGatewayList = mockRes();
await InferenceGateway.handleListClusterStorages({ query: {} }, resGatewayList);
assert.strictEqual(resGatewayList.statusCode, 200);
assert.ok(Array.isArray(resGatewayList.body.volumes || resGatewayList.body.data || resGatewayList.body));
console.log(`✅ Gateway: GET /compute/clusters/storage/volumes handled successfully.`);

// 3. GET /compute/clusters/storage/volumes/:id (Retrieve Shared Volume)
console.log('\n[Test 3] Retrieve Shared Volume (GET /compute/clusters/storage/volumes/:id)...');
const retrievedVolume = await llmGetClusterStorage(testVolumeId);
assert.strictEqual(retrievedVolume.id || retrievedVolume.volume_id, testVolumeId);
assert.ok(retrievedVolume.size_tib);
console.log(`✅ Service: Retrieved volume ${testVolumeId} (size: ${retrievedVolume.size_tib} TiB, status: ${retrievedVolume.status})`);

const resGatewayGet = mockRes();
await InferenceGateway.handleGetClusterStorage({ params: { id: testVolumeId } }, resGatewayGet);
assert.strictEqual(resGatewayGet.statusCode, 200);
assert.strictEqual(resGatewayGet.body.id || resGatewayGet.body.volume_id, testVolumeId);
console.log(`✅ Gateway: GET /compute/clusters/storage/volumes/:id handled successfully.`);

// 4. PUT /compute/clusters/storage/volumes & PATCH (Update Shared Volume)
console.log('\n[Test 4] Update Shared Volume (PUT /compute/clusters/storage/volumes)...');
const updatePayload = {
  size_tib: 8,
  volume_name: 'aphura-checkpoint-storage-scaled',
};
const updatedVolume = await llmUpdateClusterStorage(testVolumeId, updatePayload);
assert.strictEqual(updatedVolume.id || updatedVolume.volume_id, testVolumeId);
assert.strictEqual(Number(updatedVolume.size_tib), 8);
console.log(`✅ Service: Updated volume ${testVolumeId} to ${updatedVolume.size_tib} TiB (status: ${updatedVolume.status})`);

const resGatewayUpdate = mockRes();
await InferenceGateway.handleUpdateClusterStorage({ params: { id: testVolumeId }, body: updatePayload }, resGatewayUpdate);
assert.strictEqual(resGatewayUpdate.statusCode, 200);
assert.strictEqual(resGatewayUpdate.body.id || resGatewayUpdate.body.volume_id, testVolumeId);
console.log(`✅ Gateway: PUT /compute/clusters/storage/volumes handled successfully.`);

// 5. DELETE /compute/clusters/storage/volumes/:id (Delete Shared Volume)
console.log('\n[Test 5] Delete Shared Volume (DELETE /compute/clusters/storage/volumes/:id)...');
const deleteResult = await llmDeleteClusterStorage(testVolumeId);
assert.strictEqual(deleteResult.id || deleteResult.volume_id, testVolumeId);
console.log(`✅ Service: Deleted volume ${testVolumeId}`);

const resGatewayDelete = mockRes();
await InferenceGateway.handleDeleteClusterStorage({ params: { id: testVolumeId } }, resGatewayDelete);
assert.strictEqual(resGatewayDelete.statusCode, 200);
assert.strictEqual(resGatewayDelete.body.id || resGatewayDelete.body.volume_id, testVolumeId);
console.log(`✅ Gateway: DELETE /compute/clusters/storage/volumes/:id handled successfully.`);

// 6. GET /compute/regions (List Cluster Regions & Driver Versions)
console.log('\n[Test 6] List Cluster Regions & Drivers (GET /compute/regions)...');
const regionsResult = await llmListClusterRegions();
assert.ok(Array.isArray(regionsResult.regions), 'Expected regions array');
assert.ok(regionsResult.regions.length > 0, 'Expected non-empty regions list');
const firstRegion = regionsResult.regions[0];
assert.ok(firstRegion.name, 'Expected region name');
assert.ok(Array.isArray(firstRegion.supported_instance_types), 'Expected supported_instance_types array');
console.log(`✅ Service: Listed ${regionsResult.regions.length} regions (e.g. ${firstRegion.name} with GPUs ${firstRegion.supported_instance_types.join(', ')})`);

const resGatewayRegions = mockRes();
await InferenceGateway.handleListClusterRegions({}, resGatewayRegions);
assert.strictEqual(resGatewayRegions.statusCode, 200);
assert.ok(Array.isArray(resGatewayRegions.body.regions));
console.log(`✅ Gateway: GET /compute/regions handled successfully.`);

// 7. Router Stack Verification
console.log('\n[Test 7] Verifying Express Router Stack for Cluster Storage Paths...');
const registeredRoutes = [];
inferenceRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    registeredRoutes.push(`${methods} ${layer.route.path}`);
  }
});

const requiredPaths = [
  'POST /compute/clusters/storage/volumes',
  'POST /v1/compute/clusters/storage/volumes',
  'POST /clusters_storages',
  'POST /v1/clusters_storages',
  'GET /compute/clusters/storage/volumes',
  'GET /v1/compute/clusters/storage/volumes',
  'GET /clusters_storages',
  'GET /v1/clusters_storages',
  'GET /compute/clusters/storage/volumes/:id',
  'GET /v1/compute/clusters/storage/volumes/:id',
  'GET /clusters_storages/:id',
  'GET /v1/clusters_storages/:id',
  'PUT /compute/clusters/storage/volumes',
  'PUT /v1/compute/clusters/storage/volumes',
  'PUT /compute/clusters/storage/volumes/:id',
  'PUT /v1/compute/clusters/storage/volumes/:id',
  'DELETE /compute/clusters/storage/volumes/:id',
  'DELETE /v1/compute/clusters/storage/volumes/:id',
  'DELETE /clusters_storages/:id',
  'DELETE /v1/clusters_storages/:id',
  'GET /compute/regions',
  'GET /v1/compute/regions',
];

requiredPaths.forEach((path) => {
  assert.ok(
    registeredRoutes.includes(path),
    `Missing route: ${path} in registered routes`,
  );
});
console.log(`✅ Router: All ${requiredPaths.length} required cluster storage & region paths registered properly in inferenceRoutes.`);

console.log('\n🎉 ALL 6 TOGETHER.AI CLUSTER STORAGE & REGION ENDPOINTS VERIFIED & WORKING!\n');
