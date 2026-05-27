import axios from 'axios';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Enterprise PII / PHI Redactor Helper
 * Redacts highly sensitive customer and patient details (SSN, Phone, Email, Medical terms)
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
      if (['ssn', 'socialsecurity', 'phone', 'phonenumber', 'email', 'patientname', 'medicalrecord'].some(k => lowerKey.includes(k))) {
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
 * Central Multi-Protocol API Gateway for Strategic Enterprise SaaS Integrations (Phase 1)
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
      }
    };

    return credentials[this.appSlug] || { endpoint: 'https://api.mock-connector.local' };
  }

  /**
   * Core Router to Execute Enterprise Integrations Safely
   * Enforces Human-in-the-Loop (HITL) gates and redact sensitive PHI/PII data.
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
      'verifyRealPageLease'
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
          // Verified execution block
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
