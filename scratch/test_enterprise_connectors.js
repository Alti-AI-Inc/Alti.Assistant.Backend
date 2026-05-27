import dotenv from 'dotenv';
dotenv.config();

import { redactSensitiveData, EnterpriseConnector } from '../src/app/modules/search/services/enterpriseConnector.js';
import { altiEnterpriseIntelligenceSearch } from '../src/app/modules/search/tools.js';

async function runTests() {
  console.log('🚀 Running Alti.Assistant Strategic Enterprise & High-Stakes Integration Test Suite...');
  let failures = 0;

  // Test 1: PII/PHI Redaction Sanitizer
  console.log('\n🧪 [Test 1] PII/PHI Redaction Sanitizer');
  const testPayload = {
    tenantName: 'John Doe',
    ssn: '000-12-3456',
    phone: '555-867-5309',
    email: 'john.doe@enterprise-cre.com',
    comment: 'Tenant presented a diagnosis code: ICD-10-CM or a medical record number: MRN998822.',
    nested: {
      patientName: 'Jane Doe',
      ssn: '111-22-3333'
    }
  };

  const redacted = redactSensitiveData(testPayload);
  console.log('Original Payload:', JSON.stringify(testPayload, null, 2));
  console.log('Redacted Payload:', JSON.stringify(redacted, null, 2));

  if (
    redacted.ssn !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.phone !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.email !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.nested.ssn !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.nested.patientName !== '[REDACTED SENSITIVE FIELD]' ||
    !redacted.comment.includes('[REDACTED PHI]')
  ) {
    console.error('❌ Test 1 Failed: PII/PHI redaction proxy failed to fully mask sensitive details.');
    failures++;
  } else {
    console.log('✅ Test 1 Passed: SSNs, Phones, Emails, Patient names, and clinical medical terms successfully redacted.');
  }

  // Test 2: Read-Only Actions (Autodesk, Yardi, RealPage, CoStar, Argus)
  console.log('\n🧪 [Test 2] Read-Only Action Execution and Payloads');
  const readActions = [
    { app: 'autodesk', action: 'getBIM360ProjectSheets', params: {} },
    { app: 'yardi', action: 'getYardiPropertyLedger', params: { propertyId: 'prop-101' } },
    { app: 'realpage', action: 'getRealPageUnitAvailability', params: {} },
    { app: 'costar', action: 'getCoStarPropertyComps', params: { zipCode: '90210' } },
    { app: 'argus', action: 'runArgusValuationDCF', params: { propertyId: 'prop-888', rentGrowth: 0.03, discountRate: 0.08 } }
  ];

  for (const item of readActions) {
    const connector = new EnterpriseConnector(item.app, 'test-tenant');
    const res = await connector.executeAction(item.action, item.params);
    console.log(`- Executed ${item.app}.${item.action}:`, JSON.stringify(res));
    if (!res.success) {
      console.error(`❌ Test 2 Failed: Read-only action failed for ${item.app}.${item.action}`);
      failures++;
    } else {
      console.log(`  └─ Success verified.`);
    }
  }
  console.log('✅ Test 2 Passed: All read-only endpoints resolved correct structured mock datasets.');

  // Test 3: Mutative Actions Awaiting HITL Approval (verified: false)
  console.log('\n🧪 [Test 3] Mutative Actions Blocking by HITL Gates (unverified)');
  const mutativeActions = [
    { app: 'autodesk', action: 'createBIM360RFI', params: { title: 'Beam Clash', description: 'Structural steel conflicts with HVAC duct.' } },
    { app: 'yardi', action: 'updateYardiRentLedger', params: { tenantId: 't-123', ssn: '000-11-2222' } },
    { app: 'realpage', action: 'verifyRealPageLease', params: { leaseId: 'lease-901' } }
  ];

  for (const item of mutativeActions) {
    const connector = new EnterpriseConnector(item.app, 'test-tenant');
    const res = await connector.executeAction(item.action, item.params, { verified: false });
    console.log(`- Mutative ${item.app}.${item.action} (verified=false):`, JSON.stringify(res));
    if (res.status !== 'VerificationRequired' || !res.verificationId) {
      console.error(`❌ Test 3 Failed: Mutative action did not block with VerificationRequired status.`);
      failures++;
    } else {
      console.log(`  └─ Blocking gate verified (verification ID: ${res.verificationId}).`);
    }
  }
  console.log('✅ Test 3 Passed: HITL blocking gates correctly intercept and return VerificationRequired status.');

  // Test 4: Mutative Actions Executing Post-HITL Approval (verified: true)
  console.log('\n🧪 [Test 4] Mutative Actions Execution Post-Approval (verified=true)');
  for (const item of mutativeActions) {
    const connector = new EnterpriseConnector(item.app, 'test-tenant');
    const res = await connector.executeAction(item.action, item.params, { verified: true });
    console.log(`- Mutative ${item.app}.${item.action} (verified=true):`, JSON.stringify(res));
    if (!res.success) {
      console.error(`❌ Test 4 Failed: Approved mutative action failed to execute.`);
      failures++;
    } else {
      console.log(`  └─ Approved execution success verified.`);
    }
  }
  console.log('✅ Test 4 Passed: Post-HITL approved write actions execute successfully.');

  // Test 5: LangChain Tool Schema & Dynamic Structured Tool
  console.log('\n🧪 [Test 5] LangChain Dynamic Structured Tool Conformance');
  console.log(`Tool Name: ${altiEnterpriseIntelligenceSearch.name}`);
  console.log(`Schema Description: ${altiEnterpriseIntelligenceSearch.description.substring(0, 150)}...`);

  const schema = altiEnterpriseIntelligenceSearch.schema;
  if (!schema) {
    console.error('❌ Test 5 Failed: Zod schema is missing from enterprise search tool.');
    failures++;
  } else {
    // Validate standard payloads against schema
    const validInputs = [
      { app: 'autodesk', action: 'getBIM360ProjectSheets', parameters: {} },
      { app: 'yardi', action: 'updateYardiRentLedger', parameters: { tenantId: 't-999' }, verified: true },
      { app: 'realpage', action: 'getRealPageUnitAvailability', parameters: {} }
    ];

    for (const input of validInputs) {
      const parsed = schema.safeParse(input);
      if (parsed.success) {
        console.log(`✅ Zod schema valid for: ${input.app}.${input.action}`);
      } else {
        console.error(`❌ Test 5 Failed: Zod schema rejected valid inputs:`, parsed.error);
        failures++;
      }
    }
  }

  // Test 6: Safe Tool Invocation Verification
  console.log('\n🧪 [Test 6] Tool Invocation via LangChain .invoke()');
  try {
    const responseString = await altiEnterpriseIntelligenceSearch.invoke({
      app: 'costar',
      action: 'getCoStarPropertyComps',
      parameters: { zipCode: '94105' }
    });
    console.log('Tool invocation response:', responseString);
    const parsedRes = JSON.parse(responseString);
    if (!parsedRes.success || !parsedRes.comps) {
      console.error('❌ Test 6 Failed: Tool invocation output format invalid.');
      failures++;
    } else {
      console.log('✅ Test 6 Passed: Tool successfully invoked and parsed through LangChain interface.');
    }
  } catch (err) {
    console.error('❌ Test 6 Failed with error:', err.message);
    failures++;
  }

  console.log(`\n========================================`);
  if (failures === 0) {
    console.log('🟢 ALL STRATEGIC ENTERPRISE & HIGH-STAKES TESTS PASSED SUCCESSFULLY! 🟢');
    process.exit(0);
  } else {
    console.error(`🔴 ${failures} TESTS FAILED! 🔴`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Unexpected runner error:', err);
  process.exit(1);
});
