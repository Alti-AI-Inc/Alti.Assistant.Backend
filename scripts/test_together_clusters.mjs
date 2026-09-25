/**
 * Dedicated Test Suite for the Together.ai GPU Clusters API Suite (5 Endpoints)
 * References:
 * - https://docs.together.ai/reference/clusters-create
 * - https://docs.together.ai/reference/clusters-list
 * - https://docs.together.ai/reference/clusters-get
 * - https://docs.together.ai/reference/clusters-update
 * - https://docs.together.ai/reference/clusters-delete
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateCluster,
  llmListClusters,
  llmGetCluster,
  llmUpdateCluster,
  llmDeleteCluster,
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

console.log('🧪 Testing Together.ai GPU Clusters API Suite (5 Endpoints)...\n');

// 1. POST /compute/clusters & POST /clusters (Create GPU Cluster)
console.log('[Test 1] Create GPU Cluster (POST /compute/clusters)...');
const clusterPayload = {
  cluster_name: 'aphura-sovereign-training-cluster',
  region: 'sovereign-liberty-1',
  gpu_type: 'H100_SXM',
  num_gpus: 8,
  cluster_type: 'KUBERNETES',
  billing_type: 'ON_DEMAND',
  nvidia_driver_version: '560',
  cuda_version: '12.6',
};
const createdCluster = await llmCreateCluster(clusterPayload);
assert.ok(createdCluster.cluster_id || createdCluster.id, 'Expected cluster_id');
assert.ok(createdCluster.status, 'Expected cluster status');
assert.strictEqual(createdCluster.gpu_type, 'H100_SXM');
assert.strictEqual(Number(createdCluster.num_gpus), 8);
const testClusterId = createdCluster.cluster_id || createdCluster.id;
console.log(`✅ Service: Created GPU Cluster ID = ${testClusterId} (status: ${createdCluster.status}, region: ${createdCluster.region})`);

const resGatewayCreate = mockRes();
await InferenceGateway.handleCreateCluster({ body: clusterPayload }, resGatewayCreate);
assert.strictEqual(resGatewayCreate.statusCode, 200);
assert.ok(resGatewayCreate.body.cluster_id || resGatewayCreate.body.id);
console.log(`✅ Gateway: POST /compute/clusters handled successfully.`);

// 2. GET /compute/clusters & GET /clusters (List GPU Clusters)
console.log('\n[Test 2] List GPU Clusters (GET /compute/clusters)...');
const clusterList = await llmListClusters();
assert.ok(Array.isArray(clusterList.clusters) || Array.isArray(clusterList.data), 'Expected array in clusters list');
const clustersArray = clusterList.clusters || clusterList.data;
assert.ok(clustersArray.length > 0, 'Expected at least 1 cluster in catalog');
console.log(`✅ Service: Listed ${clustersArray.length} clusters (e.g. ${clustersArray[0].cluster_id || clustersArray[0].id})`);

const resGatewayList = mockRes();
await InferenceGateway.handleListClusters({ query: {} }, resGatewayList);
assert.strictEqual(resGatewayList.statusCode, 200);
assert.ok(Array.isArray(resGatewayList.body.clusters) || Array.isArray(resGatewayList.body.data));
console.log(`✅ Gateway: GET /compute/clusters handled successfully.`);

// 3. GET /compute/clusters/:id & GET /clusters/:id (Retrieve GPU Cluster)
console.log('\n[Test 3] Retrieve GPU Cluster (GET /compute/clusters/:id)...');
const retrievedCluster = await llmGetCluster(testClusterId);
assert.strictEqual(retrievedCluster.cluster_id || retrievedCluster.id, testClusterId);
assert.ok(retrievedCluster.status);
console.log(`✅ Service: Retrieved cluster ${testClusterId} (status: ${retrievedCluster.status}, gpu: ${retrievedCluster.gpu_type})`);

const resGatewayGet = mockRes();
await InferenceGateway.handleGetCluster({ params: { id: testClusterId } }, resGatewayGet);
assert.strictEqual(resGatewayGet.statusCode, 200);
assert.strictEqual(resGatewayGet.body.cluster_id || resGatewayGet.body.id, testClusterId);
console.log(`✅ Gateway: GET /compute/clusters/:id handled successfully.`);

// 4. PUT /compute/clusters/:id & PATCH (Update GPU Cluster)
console.log('\n[Test 4] Update GPU Cluster (PUT /compute/clusters/:id)...');
const updatePayload = {
  num_gpus: 16,
  cluster_name: 'aphura-sovereign-training-cluster-scaled',
};
const updatedCluster = await llmUpdateCluster(testClusterId, updatePayload);
assert.strictEqual(updatedCluster.cluster_id || updatedCluster.id, testClusterId);
assert.strictEqual(Number(updatedCluster.num_gpus), 16);
console.log(`✅ Service: Updated cluster ${testClusterId} to ${updatedCluster.num_gpus} GPUs (status: ${updatedCluster.status})`);

const resGatewayUpdate = mockRes();
await InferenceGateway.handleUpdateCluster({ params: { id: testClusterId }, body: updatePayload }, resGatewayUpdate);
assert.strictEqual(resGatewayUpdate.statusCode, 200);
assert.strictEqual(resGatewayUpdate.body.cluster_id || resGatewayUpdate.body.id, testClusterId);
console.log(`✅ Gateway: PUT /compute/clusters/:id handled successfully.`);

// 5. DELETE /compute/clusters/:id (Delete GPU Cluster)
console.log('\n[Test 5] Delete GPU Cluster (DELETE /compute/clusters/:id)...');
const deleteResult = await llmDeleteCluster(testClusterId);
assert.strictEqual(deleteResult.cluster_id || deleteResult.id, testClusterId);
console.log(`✅ Service: Deleted cluster ${testClusterId}`);

const resGatewayDelete = mockRes();
await InferenceGateway.handleDeleteCluster({ params: { id: testClusterId } }, resGatewayDelete);
assert.strictEqual(resGatewayDelete.statusCode, 200);
assert.strictEqual(resGatewayDelete.body.cluster_id || resGatewayDelete.body.id, testClusterId);
console.log(`✅ Gateway: DELETE /compute/clusters/:id handled successfully.`);

// 6. GET /compute/regions (List Cluster Regions)
console.log('\n[Test 6] List Cluster Regions (GET /compute/regions)...');
const regionsResult = await llmListClusterRegions();
assert.ok(Array.isArray(regionsResult.regions), 'Expected regions array');
assert.ok(regionsResult.regions.length > 0, 'Expected non-empty regions list');
console.log(`✅ Service: Listed ${regionsResult.regions.length} regions (e.g. ${regionsResult.regions[0]})`);

const resGatewayRegions = mockRes();
await InferenceGateway.handleListClusterRegions({}, resGatewayRegions);
assert.strictEqual(resGatewayRegions.statusCode, 200);
assert.ok(Array.isArray(resGatewayRegions.body.regions));
console.log(`✅ Gateway: GET /compute/regions handled successfully.`);

// 7. Router Stack Verification
console.log('\n[Test 7] Verifying Express Router Stack for Cluster Paths...');
const registeredRoutes = [];
inferenceRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    registeredRoutes.push(`${methods} ${layer.route.path}`);
  }
});

const requiredPaths = [
  'POST /compute/clusters',
  'POST /v1/compute/clusters',
  'POST /clusters',
  'POST /v1/clusters',
  'GET /compute/regions',
  'GET /v1/compute/regions',
  'GET /clusters/regions',
  'GET /v1/clusters/regions',
  'GET /compute/clusters',
  'GET /v1/compute/clusters',
  'GET /clusters',
  'GET /v1/clusters',
  'GET /compute/clusters/:id',
  'GET /v1/compute/clusters/:id',
  'GET /clusters/:id',
  'GET /v1/clusters/:id',
  'PUT /compute/clusters/:id',
  'PUT /v1/compute/clusters/:id',
  'PUT /clusters/:id',
  'PUT /v1/clusters/:id',
  'PATCH /compute/clusters/:id',
  'PATCH /v1/compute/clusters/:id',
  'PATCH /clusters/:id',
  'PATCH /v1/clusters/:id',
  'DELETE /compute/clusters/:id',
  'DELETE /v1/compute/clusters/:id',
  'DELETE /clusters/:id',
  'DELETE /v1/clusters/:id',
];

requiredPaths.forEach((path) => {
  assert.ok(
    registeredRoutes.includes(path),
    `Missing route: ${path} in registered routes`,
  );
});
console.log(`✅ Router: All ${requiredPaths.length} required cluster paths registered properly in inferenceRoutes.`);

console.log('\n🎉 ALL 5 TOGETHER.AI GPU CLUSTERS ENDPOINTS VERIFIED & WORKING!\n');
