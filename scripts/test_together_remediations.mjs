/**
 * Dedicated Test Suite for the Together.ai Cluster Remediations API Suite (6 Endpoints + Regions)
 * References:
 * - https://docs.together.ai/reference/remediation-create
 * - https://docs.together.ai/reference/remediation-list
 * - https://docs.together.ai/reference/remediation-get
 * - https://docs.together.ai/reference/remediation-approve
 * - https://docs.together.ai/reference/remediation-cancel
 * - https://docs.together.ai/reference/remediation-reject
 * - https://docs.together.ai/reference/clusters-list-regions
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateRemediation,
  llmListRemediations,
  llmGetRemediation,
  llmApproveRemediation,
  llmCancelRemediation,
  llmRejectRemediation,
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

console.log('🧪 Testing Together.ai Cluster Remediations Suite (6 Endpoints)...\n');

const testClusterId = 'cl_sov_test_01';
const testInstanceId = 'inst_sov_node_01';

// 1. POST .../remediations (Create Remediation)
console.log('[Test 1] Create Instance Remediation (POST .../remediations)...');
const remediationPayload = {
  mode: 'REMEDIATION_MODE_VM_ONLY',
  cluster_id: testClusterId,
  instance_id: testInstanceId,
};
const createdRem = await llmCreateRemediation(testInstanceId, remediationPayload);
assert.ok(createdRem.id || createdRem.remediation_id, 'Expected remediation ID');
assert.ok(createdRem.state, 'Expected remediation state');
assert.strictEqual(createdRem.mode, 'REMEDIATION_MODE_VM_ONLY');
const testRemId = createdRem.id || createdRem.remediation_id;
console.log(`✅ Service: Created remediation ID = ${testRemId} (state: ${createdRem.state}, mode: ${createdRem.mode})`);

const resGatewayCreate = mockRes();
await InferenceGateway.handleCreateRemediation(
  {
    params: { cluster_id: testClusterId, instance_id: testInstanceId },
    body: remediationPayload,
    query: { remediation_id: 'rem_client_custom_01' },
  },
  resGatewayCreate,
);
assert.strictEqual(resGatewayCreate.statusCode, 200);
assert.ok(resGatewayCreate.body.id || resGatewayCreate.body.remediation_id);
console.log(`✅ Gateway: POST .../remediations handled successfully.`);

// 2. GET .../remediations (List Remediations)
console.log('\n[Test 2] List Instance Remediations (GET .../remediations)...');
const remList = await llmListRemediations(testInstanceId, { cluster_id: testClusterId });
const remsArray = remList.remediations || remList.data || remList;
assert.ok(Array.isArray(remsArray), 'Expected array in remediations list');
assert.ok(remsArray.length > 0, 'Expected at least 1 remediation record');
console.log(`✅ Service: Listed ${remsArray.length} remediations (e.g. ${remsArray[0].id || remsArray[0].remediation_id})`);

const resGatewayList = mockRes();
await InferenceGateway.handleListRemediations(
  { params: { cluster_id: testClusterId, instance_id: testInstanceId }, query: {} },
  resGatewayList,
);
assert.strictEqual(resGatewayList.statusCode, 200);
assert.ok(Array.isArray(resGatewayList.body.remediations || resGatewayList.body.data || resGatewayList.body));
console.log(`✅ Gateway: GET .../remediations handled successfully.`);

// 3. GET .../remediations/:id (Retrieve Remediation Details)
console.log('\n[Test 3] Retrieve Remediation Details (GET .../remediations/:id)...');
const retrievedRem = await llmGetRemediation(testRemId, { cluster_id: testClusterId, instance_id: testInstanceId });
assert.strictEqual(retrievedRem.id || retrievedRem.remediation_id, testRemId);
assert.ok(retrievedRem.mode);
console.log(`✅ Service: Retrieved remediation ${testRemId} (state: ${retrievedRem.state}, mode: ${retrievedRem.mode})`);

const resGatewayGet = mockRes();
await InferenceGateway.handleGetRemediation(
  { params: { cluster_id: testClusterId, instance_id: testInstanceId, remediation_id: testRemId } },
  resGatewayGet,
);
assert.strictEqual(resGatewayGet.statusCode, 200);
assert.strictEqual(resGatewayGet.body.id || resGatewayGet.body.remediation_id, testRemId);
console.log(`✅ Gateway: GET .../remediations/:id handled successfully.`);

// 4. POST .../remediations/:id/approve (Approve Remediation)
console.log('\n[Test 4] Approve Remediation (POST .../remediations/:id/approve)...');
const approvedRem = await llmApproveRemediation(testRemId, { cluster_id: testClusterId, instance_id: testInstanceId });
assert.strictEqual(approvedRem.id || approvedRem.remediation_id, testRemId);
console.log(`✅ Service: Approved remediation ${testRemId} (state: ${approvedRem.state})`);

const resGatewayApprove = mockRes();
await InferenceGateway.handleApproveRemediation(
  { params: { cluster_id: testClusterId, instance_id: testInstanceId, remediation_id: testRemId }, body: {} },
  resGatewayApprove,
);
assert.strictEqual(resGatewayApprove.statusCode, 200);
assert.strictEqual(resGatewayApprove.body.id || resGatewayApprove.body.remediation_id, testRemId);
console.log(`✅ Gateway: POST .../remediations/:id/approve handled successfully.`);

// 5. POST .../remediations/:id/cancel (Cancel Remediation)
console.log('\n[Test 5] Cancel Remediation (POST .../remediations/:id/cancel)...');
const cancelledRem = await llmCancelRemediation(testRemId, { cluster_id: testClusterId, instance_id: testInstanceId });
assert.strictEqual(cancelledRem.id || cancelledRem.remediation_id, testRemId);
console.log(`✅ Service: Cancelled remediation ${testRemId} (state: ${cancelledRem.state})`);

const resGatewayCancel = mockRes();
await InferenceGateway.handleCancelRemediation(
  { params: { cluster_id: testClusterId, instance_id: testInstanceId, remediation_id: testRemId } },
  resGatewayCancel,
);
assert.strictEqual(resGatewayCancel.statusCode, 200);
assert.strictEqual(resGatewayCancel.body.id || resGatewayCancel.body.remediation_id, testRemId);
console.log(`✅ Gateway: POST .../remediations/:id/cancel handled successfully.`);

// 6. POST .../remediations/:id/reject (Reject Remediation)
console.log('\n[Test 6] Reject Remediation (POST .../remediations/:id/reject)...');
const rejectedRem = await llmRejectRemediation(testRemId, { cluster_id: testClusterId, instance_id: testInstanceId });
assert.strictEqual(rejectedRem.id || rejectedRem.remediation_id, testRemId);
console.log(`✅ Service: Rejected remediation ${testRemId} (state: ${rejectedRem.state})`);

const resGatewayReject = mockRes();
await InferenceGateway.handleRejectRemediation(
  { params: { cluster_id: testClusterId, instance_id: testInstanceId, remediation_id: testRemId }, body: {} },
  resGatewayReject,
);
assert.strictEqual(resGatewayReject.statusCode, 200);
assert.strictEqual(resGatewayReject.body.id || resGatewayReject.body.remediation_id, testRemId);
console.log(`✅ Gateway: POST .../remediations/:id/reject handled successfully.`);

// 7. GET /compute/regions (List Regions Verification)
console.log('\n[Test 7] Verify List Cluster Regions (GET /compute/regions)...');
const regions = await llmListClusterRegions();
assert.ok(Array.isArray(regions.regions));
assert.ok(regions.regions.length > 0);
console.log(`✅ Service: Cluster regions verified (${regions.regions.length} regions).`);

// 8. Router Stack Verification
console.log('\n[Test 8] Verifying Express Router Stack for Remediation Paths...');
const registeredRoutes = [];
inferenceRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    registeredRoutes.push(`${methods} ${layer.route.path}`);
  }
});

const requiredPaths = [
  'POST /compute/clusters/:cluster_id/instances/:instance_id/remediations',
  'POST /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  'POST /remediations',
  'POST /v1/remediations',
  'GET /compute/clusters/:cluster_id/instances/:instance_id/remediations',
  'GET /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  'GET /remediations',
  'GET /v1/remediations',
  'GET /compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  'GET /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  'GET /remediations/:id',
  'GET /v1/remediations/:id',
  'POST /compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  'POST /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  'POST /remediations/:id/approve',
  'POST /v1/remediations/:id/approve',
  'POST /compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  'POST /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  'POST /remediations/:id/cancel',
  'POST /v1/remediations/:id/cancel',
  'POST /compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  'POST /v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  'POST /remediations/:id/reject',
  'POST /v1/remediations/:id/reject',
];

requiredPaths.forEach((path) => {
  assert.ok(
    registeredRoutes.includes(path),
    `Missing route: ${path} in registered routes`,
  );
});
console.log(`✅ Router: All ${requiredPaths.length} required remediation paths registered properly in inferenceRoutes.`);

console.log('\n🎉 ALL 6 TOGETHER.AI REMEDIATIONS & REGIONS ENDPOINTS VERIFIED & WORKING!\n');
