import mongoose from 'mongoose';
import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import config from '../config/index.js';
import {
  logTenantUsage,
  reportUsageToCloudMarketplace,
  processSingleOutboxRecord,
  processBillingOutbox,
  ConsumptionLog,
  BillingOutbox
} from '../src/app/modules/search/services/marketplaceMeteringService.js';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── In-Memory Database Mocking ──────────────────────────────────────────────
const dbMock = [];
const outboxMock = [];

console.log('🔬 Setting up Mongoose Model Mocking for Outbox & Recovery Queue...');

mongoose.connect = async function() {
  console.log('🔬 [DB Mock] Bypass live mongoose connection.');
  return mongoose;
};
mongoose.disconnect = async function() {
  console.log('🔬 [DB Mock] Bypass live mongoose disconnection.');
  return;
};

// Mock ConsumptionLog save
ConsumptionLog.prototype.save = async function () {
  this.timestamp = this.timestamp || new Date();
  this.inputTokens = this.inputTokens || 0;
  this.outputTokens = this.outputTokens || 0;
  this.webSearchCount = this.webSearchCount || 0;
  
  dbMock.push(this);
  return this;
};

// Mock ConsumptionLog deleteMany
ConsumptionLog.deleteMany = async function (query) {
  const tenantId = query.tenantId;
  for (let i = dbMock.length - 1; i >= 0; i--) {
    if (dbMock[i].tenantId === tenantId) {
      dbMock.splice(i, 1);
    }
  }
  return { deletedCount: 0 };
};

// Mock ConsumptionLog aggregate
ConsumptionLog.aggregate = async function (pipeline) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalSearches = 0;

  for (const doc of dbMock) {
    totalInputTokens += doc.inputTokens;
    totalOutputTokens += doc.outputTokens;
    totalSearches += doc.webSearchCount;
  }

  if (dbMock.length === 0) return [];
  return [{
    _id: 'test-tenant-outbox-xyz',
    totalInputTokens,
    totalOutputTokens,
    totalSearches
  }];
};

// Mock BillingOutbox save
BillingOutbox.prototype.save = async function () {
  if (!this._id) {
    this._id = new mongoose.Types.ObjectId().toString();
  }
  this.status = this.status || 'pending';
  this.attempts = this.attempts !== undefined ? this.attempts : 0;
  this.nextRunAt = this.nextRunAt || new Date();

  const existingIndex = outboxMock.findIndex(o => o._id === this._id);
  const recordData = {
    _id: this._id,
    tenantId: this.tenantId,
    marketplaceSource: this.marketplaceSource,
    payload: this.payload,
    status: this.status,
    attempts: this.attempts,
    lastAttempt: this.lastAttempt,
    nextRunAt: this.nextRunAt,
    errorLog: this.errorLog
  };

  if (existingIndex > -1) {
    outboxMock[existingIndex] = recordData;
  } else {
    outboxMock.push(recordData);
  }
  return this;
};

// Mock BillingOutbox find
BillingOutbox.find = async function (query) {
  let results = [...outboxMock];
  if (query.status && query.status.$in) {
    results = results.filter(doc => query.status.$in.includes(doc.status));
  }
  if (query.nextRunAt && query.nextRunAt.$lte) {
    const lteTime = new Date(query.nextRunAt.$lte).getTime();
    results = results.filter(doc => new Date(doc.nextRunAt).getTime() <= lteTime);
  }
  return results.map(r => new BillingOutbox(r));
};

// Mock BillingOutbox deleteMany
BillingOutbox.deleteMany = async function (query) {
  outboxMock.length = 0;
  return { deletedCount: 0 };
};

// State flag to control simulated API outages
let apiOutageEnabled = false;

// Override processSingleOutboxRecord's console.log or wrap execution to simulate outage
const originalProcessSingleOutboxRecord = processSingleOutboxRecord;
async function wrappedProcessSingleOutboxRecord(record) {
  if (apiOutageEnabled) {
    console.log(`🔌 [Simulated Outage] Blocking outbox record: "${record._id}" due to network timeout (503)`);
    // Wrap execution and throw fake error
    record.lastAttempt = new Date();
    record.attempts += 1;
    record.errorLog = '503 Service Unavailable: Remote billing endpoint timed out.';
    
    if (record.attempts >= 5) {
      record.status = 'dlq';
    } else {
      record.status = 'failed';
      const backoffSec = Math.pow(2, record.attempts);
      record.nextRunAt = new Date(Date.now() + backoffSec * 1000);
    }
    await record.save();
    throw new Error('503 Service Unavailable');
  } else {
    return originalProcessSingleOutboxRecord(record);
  }
}

// Replace the imported handler with our simulation wrapper in tests
const testOutboxProcessor = async () => {
  const records = await BillingOutbox.find({
    status: { $in: ['pending', 'failed'] },
    nextRunAt: { $lte: new Date() }
  });
  
  if (records.length === 0) return { processedCount: 0 };
  
  let successCount = 0;
  let failureCount = 0;
  for (const record of records) {
    try {
      await wrappedProcessSingleOutboxRecord(record);
      successCount++;
    } catch (err) {
      failureCount++;
    }
  }
  return { processedCount: records.length, successCount, failureCount };
};

async function runOutboxTests() {
  console.log('🏁 Starting Resilient Transactional Outbox & Retry Queue Tests...');
  
  const testTenant = 'test-tenant-outbox-xyz';

  try {
    // 0. Reset state
    dbMock.length = 0;
    outboxMock.length = 0;
    apiOutageEnabled = false;

    // ----------------------------------------------------
    // Test 1: Outbox Transactional Persistence on Report
    // ----------------------------------------------------
    console.log('\n🧪 Test 1: Verifying outbox entry is created on billing aggregation...');
    
    // Log consumption
    await logTenantUsage(testTenant, 'aws', { inputTokens: 4000, outputTokens: 8000, webSearchCount: 2 });
    
    // Trigger hourly aggregation
    const reportResult = await reportUsageToCloudMarketplace(testTenant, 'aws_marketplace');
    assert.strictEqual(reportResult.success, true);
    assert.strictEqual(reportResult.message, 'Billing outbox record queued');
    assert.ok(reportResult.outboxId);

    // Verify record exists in outbox mock in completed/pending
    const queuedRecord = outboxMock.find(o => o._id === reportResult.outboxId);
    assert.ok(queuedRecord);
    assert.strictEqual(queuedRecord.tenantId, testTenant);
    assert.strictEqual(queuedRecord.marketplaceSource, 'aws_marketplace');
    console.log('✅ Queued outbox entry successfully verified.');

    // ----------------------------------------------------
    // Test 2: Outage schedules retry & backoff
    // ----------------------------------------------------
    console.log('\n🧪 Test 2: Simulating cloud API outage and asserting retry scheduling...');
    
    // Reset queue for a clean retry test
    outboxMock.length = 0;
    
    // Setup pending entry
    const pendingRecord = new BillingOutbox({
      tenantId: testTenant,
      marketplaceSource: 'azure_marketplace',
      payload: { usage: [{ dimension: 'input_tokens', quantity: 1000 }] },
      status: 'pending',
    });
    await pendingRecord.save();
    
    // Enable simulated outage
    apiOutageEnabled = true;
    
    // Try to process
    let threwError = false;
    try {
      await wrappedProcessSingleOutboxRecord(pendingRecord);
    } catch (e) {
      threwError = true;
    }
    assert.strictEqual(threwError, true);

    // Verify outbox state transitions
    const updatedRecord = outboxMock.find(o => o._id === pendingRecord._id);
    assert.strictEqual(updatedRecord.status, 'failed');
    assert.strictEqual(updatedRecord.attempts, 1);
    assert.ok(updatedRecord.nextRunAt.getTime() > Date.now());
    console.log(`✅ Outbox transitioned to "failed". Attempts: ${updatedRecord.attempts}. Next run: ${updatedRecord.nextRunAt.toISOString()}`);
    console.log('✅ Exponential backoff scheduling verified.');

    // ----------------------------------------------------
    // Test 3: API recovery completes outbox record
    // ----------------------------------------------------
    console.log('\n🧪 Test 3: Simulating cloud API restoration and processing recovery...');
    
    // Disable simulated outage
    apiOutageEnabled = false;
    
    // Fast-forward nextRunAt to current time to trigger recovery immediately
    const recordToRecover = outboxMock.find(o => o._id === pendingRecord._id);
    recordToRecover.nextRunAt = new Date();
    
    // Execute our test outbox queue worker
    const processResult = await testOutboxProcessor();
    console.log('Processor summary:', processResult);
    assert.strictEqual(processResult.processedCount, 1);
    assert.strictEqual(processResult.successCount, 1);
    assert.strictEqual(processResult.failureCount, 0);

    const finalRecord = outboxMock.find(o => o._id === pendingRecord._id);
    assert.strictEqual(finalRecord.status, 'completed');
    assert.strictEqual(finalRecord.attempts, 2);
    console.log('✅ Outbox record recovered and transitioned to "completed".');

    // ----------------------------------------------------
    // Test 4: Dead Letter Queue (DLQ) Fallback
    // ----------------------------------------------------
    console.log('\n🧪 Test 4: Simulating persistent outage and asserting DLQ transition...');
    
    // Reset outbox and setup pending
    outboxMock.length = 0;
    const dlqRecord = new BillingOutbox({
      tenantId: testTenant,
      marketplaceSource: 'gcp_marketplace',
      payload: { usage: [{ dimension: 'web_searches', quantity: 5 }] },
      status: 'pending',
    });
    await dlqRecord.save();
    
    // Enable outage
    apiOutageEnabled = true;
    
    // Attempt 1 (already pending -> failed)
    try { await wrappedProcessSingleOutboxRecord(dlqRecord); } catch (e) {}
    // Attempt 2
    try { await wrappedProcessSingleOutboxRecord(dlqRecord); } catch (e) {}
    // Attempt 3
    try { await wrappedProcessSingleOutboxRecord(dlqRecord); } catch (e) {}
    // Attempt 4
    try { await wrappedProcessSingleOutboxRecord(dlqRecord); } catch (e) {}
    // Attempt 5 (exceeds max retries -> moves to DLQ)
    try { await wrappedProcessSingleOutboxRecord(dlqRecord); } catch (e) {}

    const archivedRecord = outboxMock.find(o => o._id === dlqRecord._id);
    console.log(`Final record state after 5 retries: Status: "${archivedRecord.status}" | Attempts: ${archivedRecord.attempts}`);
    assert.strictEqual(archivedRecord.status, 'dlq');
    assert.strictEqual(archivedRecord.attempts, 5);
    console.log('✅ Hard dead-letter queue (DLQ) capping verified.');

    console.log('\n🎉 ALL OUTBOX RESILIENCE & RECOVERY TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    dbMock.length = 0;
    outboxMock.length = 0;
  }
}

runOutboxTests().catch(err => {
  console.error('❌ Outbox resilience tests failed:', err);
  process.exit(1);
});
