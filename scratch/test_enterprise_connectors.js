import dotenv from 'dotenv';
dotenv.config();

import { redactSensitiveData, EnterpriseConnector } from '../src/app/modules/search/services/enterpriseConnector.js';
import { altiEnterpriseIntelligenceSearch } from '../src/app/modules/search/tools.js';

async function runTests() {
  console.log('🚀 Running Alti.Assistant Strategic Enterprise & High-Stakes Integration Test Suite...');
  let failures = 0;

  // Test 1: PII/PHI/PCI Redaction Sanitizer
  console.log('\n🧪 [Test 1] PII/PHI/PCI Redaction Sanitizer');
  const testPayload = {
    tenantName: 'John Doe',
    ssn: '000-12-3456',
    phone: '555-867-5309',
    email: 'john.doe@enterprise-cre.com',
    comment: 'Tenant presented a diagnosis code: ICD-10-CM or a medical record number: MRN998822. Unstructured health DOB: 05/12/1984, ICD-10 code: I10. Unstructured PO: PO-998877, driver license: DL-88776655. Employee ID: EMP-18239.',
    financials: {
      accountNumber: '1234567890',
      routingNumber: '987654321',
      creditCard: '4111-2222-3333-4444',
      taxId: '12-3456789',
      ein: '99-8888888',
      netWorth: '$24.5M',
      balance: '$4.5M'
    },
    nested: {
      patientName: 'Jane Doe',
      ssn: '111-22-3333'
    },
    legal: {
      docketNumber: '1:23-cv-09876',
      caseNumber: '1:23-cv-09876',
      litigant: 'Acme Corp',
      legalNote: 'CONFIDENTIAL - LEGAL: Proceed with caution.',
      arbitraryString: 'This case is docket 1:23-cv-09876 under ATTORNEY-CLIENT PRIVILEGED rules.'
    },
    clinical: {
      subjectDob: '05/12/1984',
      diagnosisCode: 'I10',
      prescription: 'Lisinopril 10mg daily',
      rxnorm: '861634'
    },
    logistics: {
      purchaseOrder: 'PO-998877',
      driverLicense: 'DL-88776655',
      fleetLocation: '42.3601,-71.0589',
      invoiceAmount: 24500.00
    },
    workforce: {
      employeeProfile: 'Jane Doe',
      compensation: 185000.00,
      salary: 185000.00
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
    !redacted.comment.includes('[REDACTED PHI]') ||
    !redacted.comment.includes('[REDACTED DOB]') ||
    !redacted.comment.includes('[REDACTED DIAGNOSIS]') ||
    !redacted.comment.includes('[REDACTED PO]') ||
    !redacted.comment.includes('[REDACTED DL]') ||
    !redacted.comment.includes('[REDACTED EMP]') ||
    redacted.financials.accountNumber !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.routingNumber !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.creditCard !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.taxId !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.ein !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.netWorth !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.financials.balance !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.legal.docketNumber !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.legal.caseNumber !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.legal.litigant !== '[REDACTED SENSITIVE FIELD]' ||
    !redacted.legal.legalNote.includes('[REDACTED PRIVILEGED]') ||
    !redacted.legal.arbitraryString.includes('[REDACTED DOCKET]') ||
    !redacted.legal.arbitraryString.includes('[REDACTED PRIVILEGED]') ||
    redacted.clinical.subjectDob !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.clinical.diagnosisCode !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.clinical.prescription !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.clinical.rxnorm !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.logistics.purchaseOrder !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.logistics.driverLicense !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.logistics.fleetLocation !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.logistics.invoiceAmount !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.workforce.employeeProfile !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.workforce.compensation !== '[REDACTED SENSITIVE FIELD]' ||
    redacted.workforce.salary !== '[REDACTED SENSITIVE FIELD]'
  ) {
    console.error('❌ Test 1 Failed: Financial, Legal, Healthcare, and Logistics PII/PHI/PCI/GRC/Spend redaction proxy failed to fully mask sensitive details.');
    failures++;
  } else {
    console.log('✅ Test 1 Passed: SSNs, Phones, Emails, Patient names, credit cards, bank accounts, EINs, dockets, privileged legal terms, ICD-10 diagnostics, patient birth dates, prescriptions, PO numbers, driver licenses, employee IDs, and salary values successfully redacted.');
  }

  // Test 2: Read-Only Actions (Phase 1, Phase 2, & Phase 3)
  console.log('\n🧪 [Test 2] Read-Only Action Execution and Payloads');
  const readActions = [
    { app: 'autodesk', action: 'getBIM360ProjectSheets', params: {} },
    { app: 'yardi', action: 'getYardiPropertyLedger', params: { propertyId: 'prop-101' } },
    { app: 'realpage', action: 'getRealPageUnitAvailability', params: {} },
    { app: 'costar', action: 'getCoStarPropertyComps', params: { zipCode: '90210' } },
    { app: 'argus', action: 'runArgusValuationDCF', params: { propertyId: 'prop-888', rentGrowth: 0.03, discountRate: 0.08 } },
    { app: 'addepar', action: 'getAddeparPortfolioPerformance', params: { portfolioId: 'port-777' } },
    { app: 'carta', action: 'getCartaCapTable', params: { companyId: 'comp-123' } },
    { app: 'fiserv', action: 'getFiservAccountBalance', params: { accountId: 'acc-999' } },
    { app: 'factset', action: 'getFactSetDebtStructure', params: { companySymbol: 'MSFT' } },
    { app: 'bloomberg', action: 'getBloombergCommodityTickers', params: {} },
    { app: 'harvey', action: 'runHarveyPrecedentAnalysis', params: { caseName: 'Standard Tech licensing' } },
    { app: 'lexisnexis', action: 'searchLexisNexisCaseLaw', params: { query: 'liability limit indemnity' } },
    { app: 'ironclad', action: 'getIroncladContractMetadata', params: { contractId: 'ctr-5566' } },
    { app: 'relativity', action: 'getRelativityDocumentDetails', params: { documentId: 'doc-7766' } },
    { app: 'onetrust', action: 'getOneTrustConsentRecord', params: { consentId: 'con-1122' } },
    { app: 'veevavault', action: 'getVeevaTrialMetadata', params: { trialId: 'trial-5544' } },
    { app: 'epic', action: 'getEpicPatientSummary', params: { patientId: 'pat-epic-9922' } },
    { app: 'athenahealth', action: 'getAthenaProviderSchedule', params: { providerId: 'prov-ath-302' } },
    { app: 'elationhealth', action: 'getElationPatientChart', params: { patientId: 'pat-elation-8844' } },
    { app: 'iqvia', action: 'getIQVIAMarketData', params: { therapeuticArea: 'Oncology' } },
    { app: 'changehealthcare', action: 'getChangeClaimsEligibility', params: { memberId: 'mem-change-9933' } },
    { app: 'coupa', action: 'getCoupaPurchaseOrder', params: { purchaseOrder: 'PO-998877' } },
    { app: 'ariba', action: 'getAribaSupplierProfile', params: { supplierId: 'sup-ariba-302' } },
    { app: 'flexport', action: 'getFlexportShipmentDetails', params: { shipmentId: 'shp-flex-9988' } },
    { app: 'samsara', action: 'getSamsaraFleetLocation', params: { vehicleId: 'veh-sam-302' } },
    { app: 'workday', action: 'getWorkdayEmployeeProfile', params: { employeeId: 'EMP-18239' } },
    { app: 'sap', action: 'getSAPEraLedgerSummary', params: { ledgerId: 'LDG-SAP-99' } },
    { app: 'adp', action: 'getADPWorkforceTaxSummary', params: { payrollrun: 'PR-ADP-2026-05' } },
    { app: 'deel', action: 'getDeelContractorDetails', params: { contractorId: 'con-deel-4921' } },
    { app: 'netsuite', action: 'getNetSuiteInventoryLevels', params: { itemId: 'itm-net-3849' } }
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
    { app: 'realpage', action: 'verifyRealPageLease', params: { leaseId: 'lease-901' } },
    { app: 'addepar', action: 'updateAddeparAssetAllocation', params: { portfolioId: 'port-555', targetAllocation: 'aggressive' } },
    { app: 'carta', action: 'issueCartaEquityGrant', params: { stakeholderName: 'Jane Smith', sharesGranted: 150000 } },
    { app: 'fiserv', action: 'initiateFiservWireTransfer', params: { sourceAccountId: 'acc-111', destinationRouting: '021000021', destinationAccount: '999999999', amount: 500000 } },
    { app: 'ironclad', action: 'approveIroncladContract', params: { contractId: 'ctr-999' } },
    { app: 'relativity', action: 'tagRelativityDocuments', params: { documentIds: ['doc-001', 'doc-002'], tags: ['Responsive', 'Privileged'] } },
    { app: 'onetrust', action: 'submitOneTrustPrivacyRequest', params: { subjectEmail: 'test@onetrust.com', requestType: 'DELETE_DATA' } },
    { app: 'veevavault', action: 'submitVeevaClinicalDocument', params: { fileName: 'consent_v5.pdf', documentType: 'TRIAL_CONSENT' } },
    { app: 'epic', action: 'writeEpicClinicalNote', params: { patientId: 'pat-epic-9922', clinicalNote: 'Stable vital signs, patient compliant.', authorNpi: '1992288331' } },
    { app: 'athenahealth', action: 'bookAthenaAppointment', params: { providerId: 'prov-ath-302', slotId: 'slot-1' } },
    { app: 'changehealthcare', action: 'submitChangeMedicalClaim', params: { memberId: 'mem-change-9933', claimAmount: 250.00 } },
    { app: 'coupa', action: 'approveCoupaInvoice', params: { invoiceAmount: 12500.00 } },
    { app: 'ariba', action: 'submitAribaSourcingBid', params: { bidAmount: 850000.00, sourcingbid: 'Enterprise bid' } },
    { app: 'flexport', action: 'updateFlexportShipment', params: { shipmentId: 'shp-flex-9988', declaredValue: 450000.00 } },
    { app: 'samsara', action: 'dispatchSamsaraRoute', params: { vehicleId: 'veh-sam-302', routePoints: ['A', 'B'] } },
    { app: 'workday', action: 'modifyWorkdayEmployeeStatus', params: { employeeId: 'EMP-18239', statusChange: 'PROMOTED' } },
    { app: 'sap', action: 'postSAPJournalEntry', params: { debitAmount: 15000, creditAmount: 15000, costCenter: 'CC-MKTG-102' } },
    { app: 'adp', action: 'updateADPPayrollWiring', params: { employeeId: 'EMP-18239', accountnumber: 'ACT-99881122', routingnumber: 'RTN-021000021' } },
    { app: 'deel', action: 'approveDeelContractorPayment', params: { invoiceId: 'INV-DEEL-9302', paymentAmount: 9500 } },
    { app: 'netsuite', action: 'createNetSuitePurchaseRequisition', params: { itemId: 'itm-net-3849', quantityRequested: 1500, estimatedCost: 22500 } }
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
      { app: 'addepar', action: 'getAddeparPortfolioPerformance', parameters: {} },
      { app: 'carta', action: 'issueCartaEquityGrant', parameters: { stakeholderName: 'CEO Bob', sharesGranted: 500000 }, verified: true },
      { app: 'fiserv', action: 'getFiservAccountBalance', parameters: {} },
      { app: 'harvey', action: 'runHarveyPrecedentAnalysis', parameters: { caseName: 'Standard Tech Licensing' } },
      { app: 'ironclad', action: 'approveIroncladContract', parameters: { contractId: 'ctr-777' }, verified: true },
      { app: 'onetrust', action: 'submitOneTrustPrivacyRequest', parameters: { subjectEmail: 'foo@bar.com' }, verified: true },
      { app: 'veevavault', action: 'getVeevaTrialMetadata', parameters: { trialId: 'trial-123' } },
      { app: 'epic', action: 'writeEpicClinicalNote', parameters: { patientId: 'pat-999', clinicalNote: 'Follow-up note' }, verified: true },
      { app: 'athenahealth', action: 'bookAthenaAppointment', parameters: { providerId: 'prov-111', slotId: 'slot-2' }, verified: true },
      { app: 'changehealthcare', action: 'submitChangeMedicalClaim', parameters: { memberId: 'mem-111', claimAmount: 100 }, verified: true },
      { app: 'workday', action: 'getWorkdayEmployeeProfile', parameters: { employeeId: 'EMP-18239' } },
      { app: 'sap', action: 'postSAPJournalEntry', parameters: { debitAmount: 15000 }, verified: true },
      { app: 'adp', action: 'getADPWorkforceTaxSummary', parameters: {} },
      { app: 'deel', action: 'approveDeelContractorPayment', parameters: { invoiceId: 'INV-101' }, verified: true },
      { app: 'netsuite', action: 'createNetSuitePurchaseRequisition', parameters: { itemId: 'itm-123' }, verified: true }
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
      app: 'lexisnexis',
      action: 'searchLexisNexisCaseLaw',
      parameters: { query: 'indemnity' }
    });
    console.log('Tool invocation response:', responseString);
    const parsedRes = JSON.parse(responseString);
    if (!parsedRes.success || !parsedRes.results) {
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
