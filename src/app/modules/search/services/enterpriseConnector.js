import axios from 'axios';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Enterprise PII / PHI / PCI Redactor Helper
 * Redacts highly sensitive customer, patient, and financial details
 */
export function redactSensitiveData(payload) {
  if (!payload) return payload;

  if (typeof payload === 'string') {
    let sanitized = payload;
    
    // 1. Redact Social Security Numbers (SSNs)
    sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED SSN]');
    
    // 2. Redact Phone Numbers
    sanitized = sanitized.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED PHONE]');
    
    // 3. Redact Email Addresses
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED EMAIL]');

    // 4. Redact Medical Chart / Clinical patterns (HIPAA PHI)
    const phiTerms = ['medical record number', 'mrn', 'patient history', 'diagnosis code', 'icd-10'];
    for (const term of phiTerms) {
      const regex = new RegExp(`\\b${term}\\b\\s*:\\s*\\w+`, 'gi');
      sanitized = sanitized.replace(regex, `${term.toUpperCase()}: [REDACTED PHI]`);
    }

    // 5. Redact Credit Card Numbers (PCI DSS)
    sanitized = sanitized.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED CARD]');

    // 6. Redact Federal Employer Identification Numbers (EINs)
    sanitized = sanitized.replace(/\b\d{2}-\d{7}\b/g, '[REDACTED EIN]');

    return sanitized;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => redactSensitiveData(item));
  }

  if (typeof payload === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(payload)) {
      // Direct key checks for standard sensitive columns
      const lowerKey = key.toLowerCase();
      if (['ssn', 'socialsecurity', 'phone', 'phonenumber', 'email', 'patientname', 'medicalrecord', 'accountnumber', 'routingnumber', 'networth', 'balance', 'cardnumber', 'creditcard', 'cvv', 'taxid', 'ein'].some(k => lowerKey.includes(k))) {
        cleaned[key] = '[REDACTED SENSITIVE FIELD]';
      } else {
        cleaned[key] = redactSensitiveData(value);
      }
    }
    return cleaned;
  }

  return payload;
}

/**
 * Central Multi-Protocol API Gateway for Strategic Enterprise SaaS Integrations (Phase 1 & Phase 2)
 */
export class EnterpriseConnector {
  constructor(appSlug, tenantId) {
    this.appSlug = appSlug.toLowerCase();
    this.tenantId = tenantId;
  }

  /**
   * Resolves connection credentials from the DB config or local environmental secrets
   */
  async resolveCredentials() {
    logger.info(`[EnterpriseConnector] Resolving credentials for app: ${this.appSlug}, tenant: ${this.tenantId}`);
    
    // Mock credential resolution - Fallback to Env vars or default sandbox profiles
    const credentials = {
      autodesk: {
        clientId: process.env.GITHUB_CLIENT_ID || 'mock_autodesk_client_id',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || 'mock_autodesk_client_secret',
        endpoint: 'https://developer.api.autodesk.com'
      },
      yardi: {
        clientId: process.env.YARDI_CLIENT_ID || 'mock_yardi_client_id',
        clientSecret: process.env.YARDI_CLIENT_SECRET || 'mock_yardi_client_secret',
        endpoint: process.env.YARDI_SERVER_URL || 'https://sandbox.yardi.com/api'
      },
      realpage: {
        apiKey: process.env.CLOVER_API_KEY || 'mock_realpage_api_key',
        endpoint: 'https://api.realpage.com/v1'
      },
      costar: {
        apiToken: 'mock_costar_api_token',
        endpoint: 'https://api.costar.com/v2'
      },
      argus: {
        clientId: 'mock_argus_client_id',
        endpoint: 'https://api.argusenterprise.com/dcf/v1'
      },
      addepar: {
        apiToken: 'mock_addepar_token',
        endpoint: 'https://api.addepar.com/v1'
      },
      carta: {
        apiKey: 'mock_carta_key',
        endpoint: 'https://api.carta.com/v1.1'
      },
      fiserv: {
        clientId: 'mock_fiserv_id',
        clientSecret: 'mock_fiserv_secret',
        endpoint: 'https://api.fiserv.com/v2'
      },
      factset: {
        apiToken: 'mock_factset_token',
        endpoint: 'https://api.factset.com/v1'
      },
      bloomberg: {
        apiToken: 'mock_bloomberg_token',
        endpoint: 'https://api.bloomberg.com/v1'
      }
    };

    return credentials[this.appSlug] || { endpoint: 'https://api.mock-connector.local' };
  }

  /**
   * Core Router to Execute Enterprise Integrations Safely
   * Enforces Human-in-the-Loop (HITL) gates and redact sensitive PHI/PII/PCI data.
   */
  async executeAction(actionName, params = {}, options = {}) {
    const creds = await this.resolveCredentials();
    
    // 1. Enforce strict input data sanitization/redaction
    const sanitizedParams = redactSensitiveData(params);
    logger.info(`[EnterpriseConnector] Executing action: ${actionName} on ${this.appSlug}`);

    // 2. Intercept and block mutative/high-stakes operations to enforce HITL authorization gates
    const isMutative = [
      'createBIM360RFI',
      'updateYardiRentLedger',
      'verifyRealPageLease',
      'updateAddeparAssetAllocation',
      'issueCartaEquityGrant',
      'initiateFiservWireTransfer'
    ].includes(actionName);

    if (isMutative && !options.verified) {
      logger.warn(`[EnterpriseConnector] High-Stakes Block triggered for ${actionName}. Awaiting verification.`);
      return {
        status: 'VerificationRequired',
        verificationId: `v_${this.appSlug}_${Date.now()}`,
        message: `Authorization required to execute high-stakes transaction: ${actionName}`,
        payload: {
          app: this.appSlug,
          action: actionName,
          parameters: sanitizedParams
        }
      };
    }

    // 3. Route specific integrations
    try {
      let result;
      switch (actionName) {
        // --- Autodesk BIM 360 ---
        case 'getBIM360ProjectSheets':
          result = {
            success: true,
            sheets: [
              { sheetId: 'S-101', title: 'Foundation Plan', version: 'v2', lastModified: '2026-05-12' },
              { sheetId: 'A-201', title: 'First Floor Architectural Grid', version: 'v4', lastModified: '2026-05-20' }
            ]
          };
          break;

        case 'createBIM360RFI':
          result = {
            success: true,
            rfiId: `RFI-360-${Math.floor(Math.random() * 9000 + 1000)}`,
            status: 'OPEN',
            title: sanitizedParams.title,
            description: sanitizedParams.description
          };
          break;

        // --- Yardi Systems ---
        case 'getYardiPropertyLedger':
          result = {
            success: true,
            propertyId: sanitizedParams.propertyId || 'prop-default',
            ledger: [
              { tenantId: 't-1002', name: 'Acme Corp', outstandingBalance: 0, rentDue: 4500, status: 'PAID' },
              { tenantId: 't-1005', name: 'Global Logistics Inc', outstandingBalance: 1500, rentDue: 3000, status: 'PARTIAL' }
            ]
          };
          break;

        case 'updateYardiRentLedger':
          result = {
            success: true,
            tenantId: sanitizedParams.tenantId,
            outstandingBalance: 0,
            status: 'PAID_IN_FULL',
            updatedAt: new Date().toISOString()
          };
          break;

        // --- RealPage ---
        case 'getRealPageUnitAvailability':
          result = {
            success: true,
            availableUnits: [
              { unitId: 'U-302', floorplan: '2B-2B', vacantDays: 12, marketRent: 2350 },
              { unitId: 'U-405', floorplan: '1B-1B', vacantDays: 3, marketRent: 1800 }
            ]
          };
          break;

        case 'verifyRealPageLease':
          result = {
            success: true,
            leaseId: sanitizedParams.leaseId,
            verificationStatus: 'COMPLIANT',
            checklist: {
              backgroundCheck: 'PASSED',
              incomeVerified: 'PASSED',
              depositReceived: 'PASSED'
            }
          };
          break;

        // --- CoStar Group ---
        case 'getCoStarPropertyComps':
          result = {
            success: true,
            zipCode: sanitizedParams.zipCode,
            comps: [
              { address: '100 Commercial Blvd', propertyType: 'Office', capRate: 0.062, salePrice: 12500000 },
              { address: '250 Enterprise Way', propertyType: 'Industrial', capRate: 0.058, salePrice: 8900000 }
            ]
          };
          break;

        // --- Argus Enterprise ---
        case 'runArgusValuationDCF':
          result = {
            success: true,
            propertyId: sanitizedParams.propertyId,
            parameters: { rentGrowth: sanitizedParams.rentGrowth, discountRate: sanitizedParams.discountRate },
            valuationNPV: 15450000,
            irrProjection: 0.087,
            cashFlowTenYear: [1200000, 1260000, 1323000, 1389150, 1458607, 1531538, 1608115, 1688520, 1772946, 1861594]
          };
          break;

        // --- Addepar ---
        case 'getAddeparPortfolioPerformance':
          result = {
            success: true,
            portfolioId: sanitizedParams.portfolioId || 'port-family-office',
            ytdReturn: 0.124,
            netAssetValue: 24500000,
            allocations: [
              { class: 'Equities', weight: 0.45, value: 11025000 },
              { class: 'Fixed Income', weight: 0.25, value: 6125000 },
              { class: 'Private Equity', weight: 0.20, value: 4900000 },
              { class: 'Cash Equivalents', weight: 0.10, value: 2450000 }
            ]
          };
          break;

        case 'updateAddeparAssetAllocation':
          result = {
            success: true,
            portfolioId: sanitizedParams.portfolioId,
            targetAllocation: sanitizedParams.targetAllocation,
            status: 'REBALANCED',
            updatedAt: new Date().toISOString()
          };
          break;

        // --- Carta ---
        case 'getCartaCapTable':
          result = {
            success: true,
            companyId: sanitizedParams.companyId || 'comp-startup-99',
            totalSharesOutstanding: 10000000,
            shareholders: [
              { name: 'Founder Alice', type: 'Common', shares: 4500000, percentage: 0.45 },
              { name: 'Founder Bob', type: 'Common', shares: 3500000, percentage: 0.35 },
              { name: 'Venture Fund X', type: 'Preferred Series A', shares: 2000000, percentage: 0.20 }
            ]
          };
          break;

        case 'issueCartaEquityGrant':
          result = {
            success: true,
            grantId: `GRNT-CAR-${Math.floor(Math.random() * 9000 + 1000)}`,
            stakeholderName: sanitizedParams.stakeholderName,
            sharesGranted: sanitizedParams.sharesGranted,
            vestingStartDate: sanitizedParams.vestingStartDate || new Date().toISOString(),
            status: 'ISSUED_PENDING_SIGNATURE'
          };
          break;

        // --- Fiserv / FIS ---
        case 'getFiservAccountBalance':
          result = {
            success: true,
            accountId: sanitizedParams.accountId || 'acc-comm-8765',
            availableBalance: 4520000,
            ledgerBalance: 4550000,
            currency: 'USD'
          };
          break;

        case 'initiateFiservWireTransfer':
          result = {
            success: true,
            transactionId: `TXN-FIS-${Math.floor(Math.random() * 90000 + 10000)}`,
            sourceAccountId: sanitizedParams.sourceAccountId,
            destinationRouting: sanitizedParams.destinationRouting,
            destinationAccount: sanitizedParams.destinationAccount,
            amount: sanitizedParams.amount,
            status: 'PROCESSED_SUCCESSFULLY',
            executedAt: new Date().toISOString()
          };
          break;

        // --- FactSet ---
        case 'getFactSetDebtStructure':
          result = {
            success: true,
            companySymbol: sanitizedParams.companySymbol || 'ACME',
            totalDebt: 75000000,
            debtInstruments: [
              { instrument: 'Senior Secured Notes', rate: 0.0575, maturity: '2030-10-15', amount: 50000000 },
              { instrument: 'Revolving Credit Facility', rate: 0.065, maturity: '2028-06-01', amount: 25000000 }
            ]
          };
          break;

        // --- Bloomberg Terminal ---
        case 'getBloombergCommodityTickers':
          result = {
            success: true,
            tickers: [
              { symbol: 'CL1:COM', name: 'Crude Oil WTI', price: 78.45, changePercent: 0.012 },
              { symbol: 'GC1:COM', name: 'Gold Oct 26', price: 2345.10, changePercent: -0.004 },
              { symbol: 'NG1:COM', name: 'Natural Gas', price: 2.34, changePercent: 0.035 }
            ],
            asOf: new Date().toISOString()
          };
          break;

        default:
          throw new Error(`Unsupported action mapping: ${actionName} for enterprise application ${this.appSlug}`);
      }

      // Enforce strict response redaction to protect against outbound leaks
      return redactSensitiveData(result);

    } catch (error) {
      logger.error(`[EnterpriseConnector] API request failure: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

