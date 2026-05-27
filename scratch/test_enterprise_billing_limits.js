import mongoose from 'mongoose';
import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import config from '../config/index.js';
import {
  logTenantUsage,
  checkTenantBudgetStatus,
  getTenantSpendingHistory,
  setTenantBillingConfig,
  ConsumptionLog,
  TenantBillingConfig
} from '../src/app/modules/search/services/marketplaceMeteringService.js';
import { selectModel } from '../src/app/modules/search/services/multiCloudModelService.js';
import { googleSearch } from '../src/app/modules/search/tools.js';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── In-Memory Database Mocking ──────────────────────────────────────────────
const dbMock = [];
const configMock = [];

console.log('🔬 Setting up Mongoose Model Mocking for Enterprise Budget Limits...');

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

// Mock ConsumptionLog find
ConsumptionLog.find = async function (query) {
  let results = [...dbMock];
  if (query.tenantId) {
    results = results.filter(doc => doc.tenantId === query.tenantId);
  }
  if (query.timestamp && query.timestamp.$gte) {
    const gteTime = new Date(query.timestamp.$gte).getTime();
    results = results.filter(doc => new Date(doc.timestamp).getTime() >= gteTime);
  }
  if (query.timestamp && query.timestamp.$lt) {
    const ltTime = new Date(query.timestamp.$lt).getTime();
    results = results.filter(doc => new Date(doc.timestamp).getTime() < ltTime);
  }
  return results;
};

// Mock ConsumptionLog deleteMany
ConsumptionLog.deleteMany = async function (query) {
  const tenantId = query.tenantId;
  for (let i = dbMock.length - 1; i >= 0; i--) {
    if (dbMock[i].tenantId === tenantId) {
      dbMock.splice(i, 1);
    }
  }
  return { acknowledged: true };
};

// Mock TenantBillingConfig save
TenantBillingConfig.prototype.save = async function () {
  const existingIndex = configMock.findIndex(c => c.tenantId === this.tenantId);
  const data = {
    tenantId: this.tenantId,
    planId: this.planId || 'alti-enterprise-gold',
    monthlyBudgetLimit: this.monthlyBudgetLimit !== undefined ? this.monthlyBudgetLimit : 5000,
    monthlyBudgetAlertThreshold: this.monthlyBudgetAlertThreshold !== undefined ? this.monthlyBudgetAlertThreshold : 4000,
    inputTokenCostPerMillion: this.inputTokenCostPerMillion !== undefined ? this.inputTokenCostPerMillion : 15,
    outputTokenCostPerMillion: this.outputTokenCostPerMillion !== undefined ? this.outputTokenCostPerMillion : 60,
    searchCostPerThousand: this.searchCostPerThousand !== undefined ? this.searchCostPerThousand : 5,
    isThrottled: this.isThrottled || false
  };
  
  if (existingIndex > -1) {
    configMock[existingIndex] = data;
  } else {
    configMock.push(data);
  }
  return this;
};

// Mock TenantBillingConfig findOne
TenantBillingConfig.findOne = async function (query) {
  const cfg = configMock.find(c => c.tenantId === query.tenantId);
  if (!cfg) return null;
  return new TenantBillingConfig(cfg);
};

// Mock TenantBillingConfig findOneAndUpdate
TenantBillingConfig.findOneAndUpdate = async function (query, update, options) {
  const tenantId = query.tenantId;
  let cfg = configMock.find(c => c.tenantId === tenantId);
  if (!cfg) {
    cfg = {
      tenantId,
      planId: 'alti-enterprise-gold',
      monthlyBudgetLimit: 5000,
      monthlyBudgetAlertThreshold: 4000,
      inputTokenCostPerMillion: 15,
      outputTokenCostPerMillion: 60,
      searchCostPerThousand: 5,
      isThrottled: false
    };
    configMock.push(cfg);
  }
  if (update.$set) {
    Object.assign(cfg, update.$set);
  }
  return new TenantBillingConfig(cfg);
};

async function runBudgetLimitTests() {
  console.log('🏁 Starting Enterprise Budget Controls & Pre-Flight Block Tests...');
  
  const testTenant = 'alti-enterprise-tenant-default';

  try {
    // 0. Reset state
    dbMock.length = 0;
    configMock.length = 0;

    // ----------------------------------------------------
    // Test 1: Set Custom Pricing and Budgets
    // ----------------------------------------------------
    console.log('\n🧪 Test 1: Configure custom pricing plan and budgets...');
    await setTenantBillingConfig(testTenant, {
      planId: 'alti-enterprise-custom-platinum',
      monthlyBudgetLimit: 500, // $500 budget limit
      monthlyBudgetAlertThreshold: 400, // $400 alert threshold
      inputTokenCostPerMillion: 20, // $20/M inputs
      outputTokenCostPerMillion: 80, // $80/M outputs
      searchCostPerThousand: 10, // $10/K searches
    });

    const configDoc = await TenantBillingConfig.findOne({ tenantId: testTenant });
    assert.strictEqual(configDoc.planId, 'alti-enterprise-custom-platinum');
    assert.strictEqual(configDoc.monthlyBudgetLimit, 500);
    assert.strictEqual(configDoc.monthlyBudgetAlertThreshold, 400);
    console.log('✅ Custom configuration saved and verified.');

    // ----------------------------------------------------
    // Test 2: Calculate Custom Rates
    // ----------------------------------------------------
    console.log('\n🧪 Test 2: Simulating usage and verifying custom rate calculations...');
    
    // Add logs:
    // 10M inputs ($200)
    await logTenantUsage(testTenant, 'azure', { inputTokens: 10000000, outputTokens: 0, webSearchCount: 0 });
    // 2M outputs ($160)
    await logTenantUsage(testTenant, 'azure', { inputTokens: 0, outputTokens: 2000000, webSearchCount: 0 });
    // 2K searches ($20)
    await logTenantUsage(testTenant, 'gcp', { inputTokens: 0, outputTokens: 0, webSearchCount: 2000 });

    // Total spend should be $380 (within budget, no alert, no blocks)
    let budgetStatus = await checkTenantBudgetStatus(testTenant);
    console.log(`Current spend calculated: $${budgetStatus.currentSpend} (Expected: $380)`);
    assert.strictEqual(budgetStatus.currentSpend, 380);
    assert.strictEqual(budgetStatus.alertTriggered, false);
    assert.strictEqual(budgetStatus.limitExceeded, false);
    assert.strictEqual(budgetStatus.isBlocked, false);
    console.log('✅ Accurate dynamic pricing verified.');

    // ----------------------------------------------------
    // Test 3: Triggers Soft Alert Threshold
    // ----------------------------------------------------
    console.log('\n🧪 Test 3: Adding consumption to trigger soft budget alert...');
    
    // Add another 2M inputs ($40) -> Total $420
    await logTenantUsage(testTenant, 'aws', { inputTokens: 2000000, outputTokens: 0, webSearchCount: 0 });
    
    budgetStatus = await checkTenantBudgetStatus(testTenant);
    console.log(`Current spend calculated: $${budgetStatus.currentSpend} (Expected: $420)`);
    assert.strictEqual(budgetStatus.currentSpend, 420);
    assert.strictEqual(budgetStatus.alertTriggered, true);
    assert.strictEqual(budgetStatus.limitExceeded, false);
    assert.strictEqual(budgetStatus.isBlocked, false);
    console.log('✅ Soft alert triggered successfully.');

    // ----------------------------------------------------
    // Test 4: Triggers Hard Spend Limit Exceed Block
    // ----------------------------------------------------
    console.log('\n🧪 Test 4: Adding consumption to exceed monthly budget limit...');
    
    // Add another 1.25M outputs ($100) -> Total $520
    await logTenantUsage(testTenant, 'azure', { inputTokens: 0, outputTokens: 1250000, webSearchCount: 0 });
    
    budgetStatus = await checkTenantBudgetStatus(testTenant);
    console.log(`Current spend calculated: $${budgetStatus.currentSpend} (Expected: $520)`);
    assert.strictEqual(budgetStatus.currentSpend, 520);
    assert.strictEqual(budgetStatus.alertTriggered, true);
    assert.strictEqual(budgetStatus.limitExceeded, true);
    assert.strictEqual(budgetStatus.isBlocked, true);
    console.log('✅ Hard budget block activated successfully.');

    // ----------------------------------------------------
    // Test 5: Verify Pre-Flight Blocks LLM Invocation
    // ----------------------------------------------------
    console.log('\n🧪 Test 5: Verifying multi-cloud model pre-flight guard blocking call...');
    
    const model = selectModel({ complexity: 'simple' });
    let blockTriggered = false;
    try {
      // Prompt selection/invocation will execute callbacks immediately
      await model.invoke("what is the weather today?");
    } catch (err) {
      console.log('Intercepted error message:', err.message);
      if (err.message.includes('BillingLimitExceeded')) {
        blockTriggered = true;
      }
    }
    
    assert.strictEqual(blockTriggered, true);
    console.log('✅ LLM routing execution safely blocked by pre-flight check.');

    // ----------------------------------------------------
    // Test 6: Verify Pre-Flight Blocks Google Search Tool
    // ----------------------------------------------------
    console.log('\n🧪 Test 6: Verifying search tool pre-flight guard blocking call...');
    
    let searchBlockTriggered = false;
    try {
      await googleSearch.invoke({ query: 'scientific discoveries', tz: 'America/Detroit' });
    } catch (err) {
      console.log('Intercepted search error message:', err.message);
      if (err.message.includes('BillingLimitExceeded')) {
        searchBlockTriggered = true;
      }
    }
    
    assert.strictEqual(searchBlockTriggered, true);
    console.log('✅ Search tool execution safely blocked by pre-flight check.');

    // ----------------------------------------------------
    // Test 7: Historical cost breakdowns
    // ----------------------------------------------------
    console.log('\n🧪 Test 7: Verifying spending history details query...');
    const history = await getTenantSpendingHistory(testTenant);
    console.log('Historical totals:', history);
    assert.strictEqual(history.totalCost, 520);
    assert.strictEqual(history.details.totalInputTokens, 12000000);
    assert.strictEqual(history.details.totalOutputTokens, 3250000);
    assert.strictEqual(history.details.totalSearches, 2000);
    console.log('✅ Historical cost breakdown verifies perfectly.');

    console.log('\n🎉 ALL ENTERPRISE BUDGET & PRE-FLIGHT TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    // Cleanup
    dbMock.length = 0;
    configMock.length = 0;
  }
}

runBudgetLimitTests().catch(err => {
  console.error('❌ Budget pre-flight tests failed:', err);
  process.exit(1);
});
