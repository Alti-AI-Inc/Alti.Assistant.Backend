/**
 * Test Suite for Together.ai Dedicated Model Inference (DMI) - Models, Uploads & Configs (16 Endpoints)
 * Verifies Service Layer, Gateway Layer, and Express Router Stack with Sovereign Fallbacks
 * 
 * Endpoints Covered:
 * 1.  GET    /supported-models & /v1/supported-models (List Supported Models)
 * 2.  GET    /supported-models/:id & /v1/supported-models/:id (Get Supported Model)
 * 3.  GET    /models, /v1/models & /projects/:projectId/models (List Project Models)
 * 4.  POST   /models & /projects/:projectId/models (Create Custom Model)
 * 5.  GET    /models/:id & /projects/:projectId/models/:id (Get Custom Model)
 * 6.  PATCH  /models/:id & /projects/:projectId/models/:id (Update Custom Model)
 * 7.  DELETE /models/:id & /projects/:projectId/models/:id (Delete Custom Model)
 * 8.  GET    /models/:id/files & /projects/:projectId/models/:id/files (List Model Files)
 * 9.  GET    /models/:id/revisions & /projects/:projectId/models/:id/revisions (List Model Revisions)
 * 10. GET    /models/organization & /organizations/:organizationId/models (List Org Models)
 * 11. POST   /models/uploads & /projects/:projectId/models/uploads (Create Remote Model Upload)
 * 12. GET    /models/uploads & /projects/:projectId/models/uploads (List Remote Model Uploads)
 * 13. GET    /models/uploads/:id & /projects/:projectId/models/uploads/:id (Get Remote Model Upload)
 * 14. GET    /models/uploads/:id/events & /projects/:projectId/models/uploads/:id/events (List Model Upload Events)
 * 15. GET    /configs & /projects/:projectId/configs (List Model Configurations)
 * 16. GET    /configs/:id & /projects/:projectId/configs/:id (Get Model Configuration)
 * 
 * License: MIT
 */
import assert from 'assert';
import {
  llmListSupportedModels,
  llmGetSupportedModel,
  llmListCustomModels,
  llmCreateCustomModel,
  llmGetCustomModel,
  llmUpdateCustomModel,
  llmDeleteCustomModel,
  llmListCustomModelFiles,
  llmListCustomModelRevisions,
  llmListOrgModels,
  llmCreateModelUpload,
  llmListModelUploads,
  llmGetModelUpload,
  llmListModelUploadEvents,
  llmListModelConfigs,
  llmGetModelConfig,
} from '../src/app/services/llm.client.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import router from '../src/app/modules/inference/inference.route.js';

function mockRes() {
  return {
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
}

async function runDMIModelsTestSuite() {
  console.log('🧪 Testing Together.ai DMI Models, Uploads & Configs Suite (16 Endpoints)...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS (16 Endpoints)
  // ==========================================
  console.log('── 1. Service Layer Tests ──');

  // 1.1 List Supported Models
  console.log('[Test 1.1] Service: llmListSupportedModels()...');
  const supportedModels = await llmListSupportedModels();
  assert.ok(supportedModels && Array.isArray(supportedModels.data), 'Must return data array');
  assert.ok(supportedModels.data.length > 0, 'Supported models list must not be empty');
  console.log(`✅ Service: Found ${supportedModels.data.length} supported models (e.g. ${supportedModels.data[0].id}).`);

  // 1.2 Get Supported Model
  console.log('\n[Test 1.2] Service: llmGetSupportedModel()...');
  const supModelId = supportedModels.data[0].id;
  const supModel = await llmGetSupportedModel(supModelId);
  assert.ok(supModel.id, 'Must contain supported model id');
  console.log(`✅ Service: Retrieved supported model ${supModel.id} (${supModel.name}).`);

  // 1.3 Create Custom Model
  console.log('\n[Test 1.3] Service: llmCreateCustomModel()...');
  const newModel = await llmCreateCustomModel({
    name: 'aphura/test-deepseek-r1-custom',
    baseModel: 'deepseek-ai/DeepSeek-R1',
    visibility: 'VISIBILITY_INTERNAL',
    description: 'Custom fine-tuned finance model on Liberty Center One',
  });
  assert.ok(newModel.id, 'Must contain custom model id');
  assert.ok(newModel.name, 'Must contain custom model name');
  console.log(`✅ Service: Created custom model ${newModel.id} (${newModel.name}).`);
  const customModelId = newModel.id;

  // 1.4 List Project Models
  console.log('\n[Test 1.4] Service: llmListCustomModels()...');
  const customModels = await llmListCustomModels();
  assert.ok(customModels && Array.isArray(customModels.data), 'Must return custom models data array');
  assert.ok(customModels.data.length > 0, 'Custom models list must not be empty');
  console.log(`✅ Service: Listed ${customModels.data.length} custom models.`);

  // 1.5 Get Custom Model
  console.log('\n[Test 1.5] Service: llmGetCustomModel()...');
  const modelDetail = await llmGetCustomModel(customModelId);
  assert.ok(modelDetail.id, 'Must return model id');
  assert.strictEqual(modelDetail.id, customModelId);
  console.log(`✅ Service: Retrieved custom model detail for ${customModelId}.`);

  // 1.6 Update Custom Model
  console.log('\n[Test 1.6] Service: llmUpdateCustomModel()...');
  const updatedModel = await llmUpdateCustomModel(customModelId, {
    description: 'Updated model description with optimal SXM concurrency',
  });
  assert.ok(updatedModel.id, 'Must return updated model id');
  console.log(`✅ Service: Updated custom model ${customModelId}.`);

  // 1.7 List Model Files
  console.log('\n[Test 1.7] Service: llmListCustomModelFiles()...');
  const modelFiles = await llmListCustomModelFiles(customModelId);
  assert.ok(modelFiles && Array.isArray(modelFiles.data), 'Must return files data array');
  assert.ok(modelFiles.data.length > 0, 'Model files list must not be empty');
  console.log(`✅ Service: Found ${modelFiles.data.length} files in model ${customModelId}.`);

  // 1.8 List Model Revisions
  console.log('\n[Test 1.8] Service: llmListCustomModelRevisions()...');
  const modelRevisions = await llmListCustomModelRevisions(customModelId);
  assert.ok(modelRevisions && Array.isArray(modelRevisions.data), 'Must return revisions array');
  assert.ok(modelRevisions.data.length > 0, 'Revisions must not be empty');
  console.log(`✅ Service: Found ${modelRevisions.data.length} revisions in model ${customModelId}.`);

  // 1.9 List Organization Models
  console.log('\n[Test 1.9] Service: llmListOrgModels()...');
  const orgModels = await llmListOrgModels('org_sovereign_liberty');
  assert.ok(orgModels && Array.isArray(orgModels.data), 'Must return org models array');
  assert.ok(orgModels.data.length > 0, 'Org models must not be empty');
  console.log(`✅ Service: Found ${orgModels.data.length} organization models.`);

  // 1.10 Create Remote Model Upload
  console.log('\n[Test 1.10] Service: llmCreateModelUpload()...');
  const uploadJob = await llmCreateModelUpload({
    modelId: customModelId,
    source: { type: 'huggingface', repoId: 'deepseek-ai/DeepSeek-R1' },
  });
  assert.ok(uploadJob.id, 'Must contain upload job id');
  console.log(`✅ Service: Created remote model upload job ${uploadJob.id}.`);
  const uploadId = uploadJob.id;

  // 1.11 List Remote Model Uploads
  console.log('\n[Test 1.11] Service: llmListModelUploads()...');
  const uploadsList = await llmListModelUploads();
  assert.ok(uploadsList && Array.isArray(uploadsList.data), 'Must return uploads data array');
  assert.ok(uploadsList.data.length > 0, 'Uploads list must not be empty');
  console.log(`✅ Service: Listed ${uploadsList.data.length} model uploads.`);

  // 1.12 Get Remote Model Upload
  console.log('\n[Test 1.12] Service: llmGetModelUpload()...');
  const uploadDetail = await llmGetModelUpload(uploadId);
  assert.ok(uploadDetail.id, 'Must return upload id');
  assert.strictEqual(uploadDetail.id, uploadId);
  console.log(`✅ Service: Retrieved upload job detail for ${uploadId}.`);

  // 1.13 List Remote Model Upload Events
  console.log('\n[Test 1.13] Service: llmListModelUploadEvents()...');
  const uploadEvents = await llmListModelUploadEvents(uploadId);
  assert.ok(uploadEvents && Array.isArray(uploadEvents.data), 'Must return events data array');
  assert.ok(uploadEvents.data.length > 0, 'Upload events must not be empty');
  console.log(`✅ Service: Retrieved ${uploadEvents.data.length} events for upload ${uploadId}.`);

  // 1.14 List Model Configurations
  console.log('\n[Test 1.14] Service: llmListModelConfigs()...');
  const configsList = await llmListModelConfigs({ referenceModel: 'deepseek-ai/DeepSeek-R1' });
  assert.ok(configsList && Array.isArray(configsList.data), 'Must return configs data array');
  assert.ok(configsList.data.length > 0, 'Configs list must not be empty');
  console.log(`✅ Service: Listed ${configsList.data.length} model configurations.`);
  const configId = configsList.data[0].id;

  // 1.15 Get Model Configuration
  console.log('\n[Test 1.15] Service: llmGetModelConfig()...');
  const configDetail = await llmGetModelConfig(configId);
  assert.ok(configDetail.id, 'Must return config id');
  assert.strictEqual(configDetail.id, configId);
  assert.ok(configDetail.hardware, 'Must specify hardware target');
  console.log(`✅ Service: Retrieved config detail for ${configId} (hardware=${configDetail.hardware}).`);

  // 1.16 Delete Custom Model
  console.log('\n[Test 1.16] Service: llmDeleteCustomModel()...');
  const deletedModel = await llmDeleteCustomModel(customModelId);
  assert.ok(deletedModel.id, 'Must contain model id');
  assert.ok(deletedModel.deleted, 'Must indicate deleted');
  console.log(`✅ Service: Deleted custom model ${customModelId}.`);

  // ==========================================
  // 2. GATEWAY LAYER TESTS (16 Handlers)
  // ==========================================
  console.log('\n── 2. Gateway Layer Tests ──');

  // Gw 1: handleListSupportedModels
  console.log('[Test 2.1] Gateway: handleListSupportedModels()...');
  const resGw1 = mockRes();
  await InferenceGateway.handleListSupportedModels({ query: {}, params: {} }, resGw1);
  assert.strictEqual(resGw1.statusCode, 200);
  assert.ok(Array.isArray(resGw1.body.data));
  console.log(`✅ Gateway: handleListSupportedModels succeeded.`);

  // Gw 2: handleGetSupportedModel
  console.log('\n[Test 2.2] Gateway: handleGetSupportedModel()...');
  const resGw2 = mockRes();
  await InferenceGateway.handleGetSupportedModel({ params: { id: supModelId }, query: {} }, resGw2);
  assert.strictEqual(resGw2.statusCode, 200);
  assert.strictEqual(resGw2.body.id, supModelId);
  console.log(`✅ Gateway: handleGetSupportedModel succeeded.`);

  // Gw 3: handleCreateCustomModel
  console.log('\n[Test 2.3] Gateway: handleCreateCustomModel()...');
  const resGw3 = mockRes();
  await InferenceGateway.handleCreateCustomModel(
    { body: { name: 'aphura/gw-custom-model', baseModel: 'deepseek-ai/DeepSeek-R1' }, query: {}, params: {} },
    resGw3
  );
  assert.strictEqual(resGw3.statusCode, 200);
  assert.ok(resGw3.body.id);
  const gwModelId = resGw3.body.id;
  console.log(`✅ Gateway: handleCreateCustomModel succeeded (id=${gwModelId}).`);

  // Gw 4: handleListCustomModels
  console.log('\n[Test 2.4] Gateway: handleListCustomModels()...');
  const resGw4 = mockRes();
  await InferenceGateway.handleListCustomModels({ query: {}, params: {} }, resGw4);
  assert.strictEqual(resGw4.statusCode, 200);
  assert.ok(Array.isArray(resGw4.body.data));
  console.log(`✅ Gateway: handleListCustomModels succeeded.`);

  // Gw 5: handleGetCustomModel
  console.log('\n[Test 2.5] Gateway: handleGetCustomModel()...');
  const resGw5 = mockRes();
  await InferenceGateway.handleGetCustomModel({ params: { id: gwModelId }, query: {} }, resGw5);
  assert.strictEqual(resGw5.statusCode, 200);
  assert.strictEqual(resGw5.body.id, gwModelId);
  console.log(`✅ Gateway: handleGetCustomModel succeeded.`);

  // Gw 6: handleUpdateCustomModel
  console.log('\n[Test 2.6] Gateway: handleUpdateCustomModel()...');
  const resGw6 = mockRes();
  await InferenceGateway.handleUpdateCustomModel(
    { params: { id: gwModelId }, body: { description: 'Updated via Gateway' }, query: {} },
    resGw6
  );
  assert.strictEqual(resGw6.statusCode, 200);
  assert.strictEqual(resGw6.body.id, gwModelId);
  console.log(`✅ Gateway: handleUpdateCustomModel succeeded.`);

  // Gw 7: handleListCustomModelFiles
  console.log('\n[Test 2.7] Gateway: handleListCustomModelFiles()...');
  const resGw7 = mockRes();
  await InferenceGateway.handleListCustomModelFiles({ params: { id: gwModelId }, query: {} }, resGw7);
  assert.strictEqual(resGw7.statusCode, 200);
  assert.ok(Array.isArray(resGw7.body.data));
  console.log(`✅ Gateway: handleListCustomModelFiles succeeded.`);

  // Gw 8: handleListCustomModelRevisions
  console.log('\n[Test 2.8] Gateway: handleListCustomModelRevisions()...');
  const resGw8 = mockRes();
  await InferenceGateway.handleListCustomModelRevisions({ params: { id: gwModelId }, query: {} }, resGw8);
  assert.strictEqual(resGw8.statusCode, 200);
  assert.ok(Array.isArray(resGw8.body.data));
  console.log(`✅ Gateway: handleListCustomModelRevisions succeeded.`);

  // Gw 9: handleListOrgModels
  console.log('\n[Test 2.9] Gateway: handleListOrgModels()...');
  const resGw9 = mockRes();
  await InferenceGateway.handleListOrgModels({ params: {}, query: { organizationId: 'org_test' } }, resGw9);
  assert.strictEqual(resGw9.statusCode, 200);
  assert.ok(Array.isArray(resGw9.body.data));
  console.log(`✅ Gateway: handleListOrgModels succeeded.`);

  // Gw 10: handleCreateModelUpload
  console.log('\n[Test 2.10] Gateway: handleCreateModelUpload()...');
  const resGw10 = mockRes();
  await InferenceGateway.handleCreateModelUpload(
    { body: { modelId: gwModelId, source: { type: 'huggingface', repoId: 'test/repo' } }, query: {}, params: {} },
    resGw10
  );
  assert.strictEqual(resGw10.statusCode, 200);
  assert.ok(resGw10.body.id);
  const gwUploadId = resGw10.body.id;
  console.log(`✅ Gateway: handleCreateModelUpload succeeded (id=${gwUploadId}).`);

  // Gw 11: handleListModelUploads
  console.log('\n[Test 2.11] Gateway: handleListModelUploads()...');
  const resGw11 = mockRes();
  await InferenceGateway.handleListModelUploads({ query: {}, params: {} }, resGw11);
  assert.strictEqual(resGw11.statusCode, 200);
  assert.ok(Array.isArray(resGw11.body.data));
  console.log(`✅ Gateway: handleListModelUploads succeeded.`);

  // Gw 12: handleGetModelUpload
  console.log('\n[Test 2.12] Gateway: handleGetModelUpload()...');
  const resGw12 = mockRes();
  await InferenceGateway.handleGetModelUpload({ params: { id: gwUploadId }, query: {} }, resGw12);
  assert.strictEqual(resGw12.statusCode, 200);
  assert.strictEqual(resGw12.body.id, gwUploadId);
  console.log(`✅ Gateway: handleGetModelUpload succeeded.`);

  // Gw 13: handleListModelUploadEvents
  console.log('\n[Test 2.13] Gateway: handleListModelUploadEvents()...');
  const resGw13 = mockRes();
  await InferenceGateway.handleListModelUploadEvents({ params: { id: gwUploadId }, query: {} }, resGw13);
  assert.strictEqual(resGw13.statusCode, 200);
  assert.ok(Array.isArray(resGw13.body.data));
  console.log(`✅ Gateway: handleListModelUploadEvents succeeded.`);

  // Gw 14: handleListModelConfigs
  console.log('\n[Test 2.14] Gateway: handleListModelConfigs()...');
  const resGw14 = mockRes();
  await InferenceGateway.handleListModelConfigs({ query: {}, params: {} }, resGw14);
  assert.strictEqual(resGw14.statusCode, 200);
  assert.ok(Array.isArray(resGw14.body.data));
  console.log(`✅ Gateway: handleListModelConfigs succeeded.`);

  // Gw 15: handleGetModelConfig
  console.log('\n[Test 2.15] Gateway: handleGetModelConfig()...');
  const resGw15 = mockRes();
  await InferenceGateway.handleGetModelConfig({ params: { id: configId }, query: {} }, resGw15);
  assert.strictEqual(resGw15.statusCode, 200);
  assert.strictEqual(resGw15.body.id, configId);
  console.log(`✅ Gateway: handleGetModelConfig succeeded.`);

  // Gw 16: handleDeleteCustomModel
  console.log('\n[Test 2.16] Gateway: handleDeleteCustomModel()...');
  const resGw16 = mockRes();
  await InferenceGateway.handleDeleteCustomModel({ params: { id: gwModelId }, query: {} }, resGw16);
  assert.strictEqual(resGw16.statusCode, 200);
  assert.strictEqual(resGw16.body.id, gwModelId);
  assert.ok(resGw16.body.deleted);
  console.log(`✅ Gateway: handleDeleteCustomModel succeeded.`);

  // ==========================================
  // 3. ROUTER STACK & ROUTE PRECEDENCE VERIFICATION
  // ==========================================
  console.log('\n── 3. Router Stack & Precedence Tests ──');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const expectedDmiModelRoutes = [
    { path: '/supported-models', method: 'GET' },
    { path: '/v1/supported-models', method: 'GET' },
    { path: '/supported-models/:id', method: 'GET' },
    { path: '/v1/supported-models/:id', method: 'GET' },
    { path: '/models/organization', method: 'GET' },
    { path: '/v1/models/organization', method: 'GET' },
    { path: '/models/org', method: 'GET' },
    { path: '/v1/models/org', method: 'GET' },
    { path: '/organizations/:organizationId/models', method: 'GET' },
    { path: '/models/uploads', method: 'POST' },
    { path: '/v1/models/uploads', method: 'POST' },
    { path: '/models/uploads', method: 'GET' },
    { path: '/v1/models/uploads', method: 'GET' },
    { path: '/models/uploads/:id/events', method: 'GET' },
    { path: '/v1/models/uploads/:id/events', method: 'GET' },
    { path: '/models/uploads/:id', method: 'GET' },
    { path: '/v1/models/uploads/:id', method: 'GET' },
    { path: '/models/:id/files', method: 'GET' },
    { path: '/v1/models/:id/files', method: 'GET' },
    { path: '/models/:id/revisions', method: 'GET' },
    { path: '/v1/models/:id/revisions', method: 'GET' },
    { path: '/models', method: 'POST' },
    { path: '/v1/models', method: 'POST' },
    { path: '/projects/:projectId/models', method: 'GET' },
    { path: '/v1/projects/:projectId/models', method: 'GET' },
    { path: '/models/:id', method: 'GET' },
    { path: '/v1/models/:id', method: 'GET' },
    { path: '/models/:id', method: 'PATCH' },
    { path: '/v1/models/:id', method: 'PATCH' },
    { path: '/models/:id', method: 'PUT' },
    { path: '/v1/models/:id', method: 'PUT' },
    { path: '/models/:id', method: 'DELETE' },
    { path: '/v1/models/:id', method: 'DELETE' },
    { path: '/configs', method: 'GET' },
    { path: '/v1/configs', method: 'GET' },
    { path: '/configs/:id', method: 'GET' },
    { path: '/v1/configs/:id', method: 'GET' },
  ];

  for (const exp of expectedDmiModelRoutes) {
    const match = routes.find(
      (r) => r.path === exp.path && r.methods.includes(exp.method)
    );
    assert.ok(match, `Route ${exp.method} ${exp.path} must be registered in router`);
  }
  console.log(`✅ Router: All ${expectedDmiModelRoutes.length} expected DMI routes successfully registered.`);

  // Verify route precedence:
  // /models/organization, /models/uploads, /models/:id/files, /models/:id/revisions must appear before /models/:id
  const orgModelIdx = routes.findIndex((r) => r.path === '/models/organization');
  const uploadsIdx = routes.findIndex((r) => r.path === '/models/uploads');
  const filesIdx = routes.findIndex((r) => r.path === '/models/:id/files');
  const modelIdIdx = routes.findIndex((r) => r.path === '/models/:id');

  assert.ok(orgModelIdx !== -1, '/models/organization must exist');
  assert.ok(uploadsIdx !== -1, '/models/uploads must exist');
  assert.ok(filesIdx !== -1, '/models/:id/files must exist');
  assert.ok(modelIdIdx !== -1, '/models/:id must exist');

  assert.ok(orgModelIdx < modelIdIdx, `/models/organization (${orgModelIdx}) must precede /models/:id (${modelIdIdx})`);
  assert.ok(uploadsIdx < modelIdIdx, `/models/uploads (${uploadsIdx}) must precede /models/:id (${modelIdIdx})`);
  assert.ok(filesIdx < modelIdIdx, `/models/:id/files (${filesIdx}) must precede /models/:id (${modelIdIdx})`);
  console.log(`✅ Router: Precedence confirmed! /models/organization (${orgModelIdx}), /models/uploads (${uploadsIdx}), /models/:id/files (${filesIdx}) all precede /models/:id (${modelIdIdx}).`);

  console.log('\n🎉 ALL 16 DMI MODELS, UPLOADS & CONFIGS TESTS PASSED CLEANLY (16/16 VERIFIED)!\n');
}

runDMIModelsTestSuite().catch((err) => {
  console.error('❌ DMI Models Test Suite Failed:', err);
  process.exit(1);
});
