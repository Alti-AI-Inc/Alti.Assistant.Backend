import mongoose from 'mongoose';
import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import config from '../config/index.js';
import {
  logTenantUsage,
  aggregateHourlyUsage,
  reportUsageToCloudMarketplace,
  ConsumptionLog
} from '../src/app/modules/search/services/marketplaceMeteringService.js';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── In-Memory Database Mocking ──────────────────────────────────────────────
const dbMock = [];

console.log('🔬 Setting up Mongoose Model Mocking for ConsumptionLog...');

// Mock mongoose connect and disconnect to bypass live database requirements
mongoose.connect = async function() {
  console.log('🔬 [DB Mock] Bypass live mongoose connection.');
  return mongoose;
};
mongoose.disconnect = async function() {
  console.log('🔬 [DB Mock] Bypass live mongoose disconnection.');
  return;
};

// Mock save method
ConsumptionLog.prototype.save = async function () {
  this.timestamp = this.timestamp || new Date();
  this.inputTokens = this.inputTokens || 0;
  this.outputTokens = this.outputTokens || 0;
  this.webSearchCount = this.webSearchCount || 0;
  
  dbMock.push({
    tenantId: this.tenantId,
    timestamp: this.timestamp,
    provider: this.provider,
    inputTokens: this.inputTokens,
    outputTokens: this.outputTokens,
    webSearchCount: this.webSearchCount
  });
  return this;
};

// Mock deleteMany
ConsumptionLog.deleteMany = async function (query) {
  console.log('🔬 [DB Mock] deleteMany query:', JSON.stringify(query));
  const initialLength = dbMock.length;
  const tenantId = query.tenantId;
  for (let i = dbMock.length - 1; i >= 0; i--) {
    if (dbMock[i].tenantId === tenantId) {
      dbMock.splice(i, 1);
    }
  }
  return { deletedCount: initialLength - dbMock.length };
};

// Mock aggregate
ConsumptionLog.aggregate = async function (pipeline) {
  console.log('🔬 [DB Mock] aggregate pipeline:', JSON.stringify(pipeline, null, 2));
  const matchStage = pipeline.find(stage => stage.$match)?.$match;
  const groupStage = pipeline.find(stage => stage.$group)?.$group;

  let results = [...dbMock];

  if (matchStage) {
    const { tenantId, timestamp } = matchStage;
    if (tenantId) {
      results = results.filter(doc => doc.tenantId === tenantId);
    }
    if (timestamp && timestamp.$gte) {
      const gteTime = new Date(timestamp.$gte).getTime();
      results = results.filter(doc => new Date(doc.timestamp).getTime() >= gteTime);
    }
  }

  if (groupStage) {
    if (results.length === 0) {
      return [];
    }
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSearches = 0;

    for (const doc of results) {
      totalInputTokens += doc.inputTokens;
      totalOutputTokens += doc.outputTokens;
      totalSearches += doc.webSearchCount;
    }

    return [{
      _id: groupStage._id === '$tenantId' ? results[0].tenantId : null,
      totalInputTokens,
      totalOutputTokens,
      totalSearches
    }];
  }

  return results;
};

async function runBillingTests() {
  console.log('🏁 Starting Enterprise Marketplace Billing & Consumption Metering Tests...');
  
  // Connect will bypass automatically thanks to our mock
  await mongoose.connect('mongodb://localhost:27017/mock');

  const testTenant = 'test-enterprise-tenant-abc';

  try {
    // 0. Clean up any previous test data
    console.log('\n🧹 Cleaning up old test logs...');
    await ConsumptionLog.deleteMany({ tenantId: testTenant });

    // ----------------------------------------------------
    // Test 1: Log Consumption Events
    // ----------------------------------------------------
    console.log('\n🧪 Test 1: Logging tenant consumption logs...');
    
    // Log GCP consumption
    const gcpLog = await logTenantUsage(testTenant, 'gcp', {
      inputTokens: 500,
      outputTokens: 1200,
      webSearchCount: 0
    });
    assert.strictEqual(gcpLog.provider, 'gcp');
    assert.strictEqual(gcpLog.inputTokens, 500);
    assert.strictEqual(gcpLog.outputTokens, 1200);
    assert.strictEqual(gcpLog.webSearchCount, 0);

    // Log Azure consumption
    const azureLog = await logTenantUsage(testTenant, 'azure', {
      inputTokens: 800,
      outputTokens: 1500,
      webSearchCount: 0
    });
    assert.strictEqual(azureLog.provider, 'azure');
    assert.strictEqual(azureLog.inputTokens, 800);
    assert.strictEqual(azureLog.outputTokens, 1500);

    // Log AWS consumption
    const awsLog = await logTenantUsage(testTenant, 'aws', {
      inputTokens: 100,
      outputTokens: 400,
      webSearchCount: 0
    });
    assert.strictEqual(awsLog.provider, 'aws');
    assert.strictEqual(awsLog.inputTokens, 100);
    assert.strictEqual(awsLog.outputTokens, 400);

    // Log Search tool consumption
    const searchLog = await logTenantUsage(testTenant, 'gcp', {
      inputTokens: 0,
      outputTokens: 0,
      webSearchCount: 1
    });
    assert.strictEqual(searchLog.webSearchCount, 1);

    console.log('✅ All logging events verified successfully.');

    // ----------------------------------------------------
    // Test 2: Aggregate Hourly Usage
    // ----------------------------------------------------
    console.log('\n🧪 Test 2: Aggregating hourly consumption metrics...');
    
    const aggregated = await aggregateHourlyUsage(testTenant);
    console.log('Aggregated metrics:', aggregated);
    
    assert.strictEqual(aggregated.totalInputTokens, 1400); // 500 + 800 + 100
    assert.strictEqual(aggregated.totalOutputTokens, 3100); // 1200 + 1500 + 400
    assert.strictEqual(aggregated.totalSearches, 1);
    
    console.log('✅ Aggregated hourly totals match perfectly.');

    // ----------------------------------------------------
    // Test 3: AWS Marketplace Report Payload Structure
    // ----------------------------------------------------
    console.log('\n🧪 Test 3: AWS Marketplace payload validation...');
    const awsResult = await reportUsageToCloudMarketplace(testTenant, 'aws_marketplace');
    assert.strictEqual(awsResult.success, true);
    assert.strictEqual(awsResult.provider, 'aws');
    
    const awsPayload = awsResult.payload;
    assert.strictEqual(awsPayload.tenantId, testTenant);
    assert.strictEqual(awsPayload.usage.find(u => u.dimension === 'input_tokens').quantity, 1400);
    assert.strictEqual(awsPayload.usage.find(u => u.dimension === 'output_tokens').quantity, 3100);
    assert.strictEqual(awsPayload.usage.find(u => u.dimension === 'web_searches').quantity, 1);
    console.log('✅ AWS batchMeterUsage payload verification passed.');

    // ----------------------------------------------------
    // Test 4: Azure Marketplace Report Payload Structure
    // ----------------------------------------------------
    console.log('\n🧪 Test 4: Azure Marketplace payload validation...');
    const azureResult = await reportUsageToCloudMarketplace(testTenant, 'azure_marketplace');
    assert.strictEqual(azureResult.success, true);
    assert.strictEqual(azureResult.provider, 'azure');
    
    const azurePayload = azureResult.payload;
    assert.strictEqual(azurePayload.tenantId, testTenant);
    assert.strictEqual(azurePayload.usage.find(u => u.dimension === 'input_tokens').quantity, 1400);
    console.log('✅ Azure metered usage payload verification passed.');

    // ----------------------------------------------------
    // Test 5: GCP Marketplace Report Payload Structure
    // ----------------------------------------------------
    console.log('\n🧪 Test 5: Google Cloud Marketplace payload validation...');
    const gcpResult = await reportUsageToCloudMarketplace(testTenant, 'gcp_marketplace');
    assert.strictEqual(gcpResult.success, true);
    assert.strictEqual(gcpResult.provider, 'gcp');
    
    const gcpPayload = gcpResult.payload;
    assert.strictEqual(gcpPayload.tenantId, testTenant);
    assert.strictEqual(gcpPayload.usage.find(u => u.dimension === 'web_searches').quantity, 1);
    console.log('✅ Google Cloud Partner Procurement payload verification passed.');

    console.log('\n🎉 ALL BILLING & METERING TESTS PASSED!');
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test logs...');
    await ConsumptionLog.deleteMany({ tenantId: testTenant });
    await mongoose.disconnect();
  }
}

runBillingTests().catch(err => {
  console.error('❌ Billing verification tests failed:', err);
  process.exit(1);
});
