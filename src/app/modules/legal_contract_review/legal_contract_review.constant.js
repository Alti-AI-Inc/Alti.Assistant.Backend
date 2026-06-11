/**
 * @fileoverview This file contains constants related to the configuration, intents, aspects,
 * and messaging for the legal contract review module. It defines various parameters
 * for AI model interaction, file handling, review types, and system prompts.
 * It also includes workspace and plan-level configurations for managing feature access and limits.
 * @module legal_contract_review/constants
 */

/**
 * @typedef {object} LegalContractReviewConfig
 * @property {string} MODEL - The AI model to be used for contract review processing.
 * @property {number} TEMPERATURE - The creativity/randomness of the AI model's output. Lower values (e.g., 0.5) are preferred for precise legal analysis.
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens the AI model is allowed to generate in its response.
 * @property {number} MAX_FILE_SIZE - The maximum allowed size for an uploaded contract file in bytes (e.g., 10MB). This is a system-wide fallback, plan-specific limits should be checked first.
 * @property {number} MAX_CACHED_TEXT_SIZE - The maximum size of contract text that can be cached for review in bytes (e.g., 1MB).
 * @property {string[]} SUPPORTED_MIME_TYPES - An array of MIME types for contract files that the system can process.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS - An array of file extensions for contract files that the system can process.
 */
/**
 * Configuration settings for the legal contract review module, including AI model parameters,
 * file size limits, and supported file types.
 * @type {LegalContractReviewConfig}
 */
export const LEGAL_CONTRACT_REVIEW_CONFIG = {
  // BUG FIX: Corrected model name from 'gemini-2.5-flash' to a valid, existing model.
  MODEL: 'gemini-1.5-flash',
  TEMPERATURE: 0.5, // Lower temperature for more precise legal analysis
  MAX_OUTPUT_TOKENS: 8192,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CACHED_TEXT_SIZE: 1 * 1024 * 1024, // 1MB text cache limit
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
  ],
  SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.docx', '.doc', '.txt'],
};

/**
 * @typedef {object} ContractReviewIntents
 * @property {string} GENERAL_REVIEW - A broad review covering key aspects of the contract.
 * @property {string} CLAUSE_ANALYSIS - Detailed examination and explanation of specific clauses.
 * @property {string} RISK_ASSESSMENT - Identification and evaluation of potential legal, financial, or operational risks.
 * @property {string} COMPLIANCE_CHECK - Verification against relevant laws, regulations, and industry standards.
 * @property {string} FAIRNESS_EVALUATION - Assessment of the balance and equity of terms between parties.
 * @property {string} TERMINOLOGY_CHECK - Review for correct and consistent use of legal terms and definitions.
 * @property {string} AMENDMENT_SUGGESTIONS - Recommendations for changes or improvements to contract terms.
 * @property {string} COMPARISON - Analysis comparing multiple contracts or versions.
 * @property {string} SUMMARY - A concise overview of the contract's main points.
 * @property {string} CLARIFICATION - Request for more information or explanation on a specific point.
 * @property {string} UNKNOWN - Indicates that the user's intent could not be determined.
 */
/**
 * Defines the various types of review intents a user might have for a legal contract.
 * These are used to guide the AI's analysis and response.
 * @type {ContractReviewIntents}
 */
export const CONTRACT_REVIEW_INTENTS = {
  GENERAL_REVIEW: 'general_review',
  CLAUSE_ANALYSIS: 'clause_analysis',
  RISK_ASSESSMENT: 'risk_assessment',
  COMPLIANCE_CHECK: 'compliance_check',
  FAIRNESS_EVALUATION: 'fairness_evaluation',
  TERMINOLOGY_CHECK: 'terminology_check',
  AMENDMENT_SUGGESTIONS: 'amendment_suggestions',
  COMPARISON: 'comparison',
  SUMMARY: 'summary',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

/**
 * @typedef {object} ContractReviewAspects
 * @property {string} OBLIGATIONS - Focus on the duties and responsibilities of each party.
 * @property {string} RIGHTS - Focus on the entitlements and privileges of each party.
 * @property {string} LIABILITIES - Focus on potential legal responsibilities and financial burdens.
 * @property {string} TERMINATION - Focus on conditions and procedures for ending the contract.
 * @property {string} PAYMENT_TERMS - Focus on financial arrangements, schedules, and conditions.
 * @property {string} CONFIDENTIALITY - Focus on provisions related to sensitive information.
 * @property {string} INTELLECTUAL_PROPERTY - Focus on ownership and usage rights of intellectual assets.
 * @property {string} INDEMNIFICATION - Focus on clauses for compensation for loss or damage.
 * @property {string} DISPUTE_RESOLUTION - Focus on mechanisms for resolving disagreements.
 * @property {string} FORCE_MAJEURE - Focus on clauses addressing unforeseeable circumstances.
 * @property {string} GOVERNING_LAW - Focus on the jurisdiction whose laws will apply.
 * @property {string} WARRANTIES - Focus on guarantees and assurances provided.
 * @property {string} JURISDICTION - Focus on the legal authority over the contract.
 * @property {string} NOTICE_PROVISIONS - Focus on requirements for formal communication.
 */
/**
 * Defines specific aspects or categories within a legal contract that can be targeted for review.
 * @type {ContractReviewAspects}
 */
export const CONTRACT_REVIEW_ASPECTS = {
  OBLIGATIONS: 'obligations',
  RIGHTS: 'rights',
  LIABILITIES: 'liabilities',
  TERMINATION: 'termination',
  PAYMENT_TERMS: 'payment_terms',
  CONFIDENTIALITY: 'confidentiality',
  INTELLECTUAL_PROPERTY: 'intellectual_property',
  INDEMNIFICATION: 'indemnification',
  DISPUTE_RESOLUTION: 'dispute_resolution',
  FORCE_MAJEURE: 'force_majeure',
  GOVERNING_LAW: 'governing_law',
  WARRANTIES: 'warranties',
  JURISDICTION: 'jurisdiction',
  NOTICE_PROVISIONS: 'notice_provisions',
};

/**
 * @typedef {object} ReviewDepthLevels
 * @property {string} QUICK - A brief overview focusing on key clauses and immediate concerns.
 * @property {string} STANDARD - A comprehensive review covering most important aspects.
 * @property {string} DETAILED - An in-depth, clause-by-clause analysis.
 * @property {string} COMPREHENSIVE - The most thorough review, potentially including risk matrices and extensive recommendations.
 */
/**
 * Defines the different levels of depth or granularity for a contract review.
 * @type {ReviewDepthLevels}
 */
export const REVIEW_DEPTH = {
  QUICK: 'quick', // Quick overview of key clauses
  STANDARD: 'standard', // Standard comprehensive review
  DETAILED: 'detailed', // Detailed clause-by-clause analysis
  COMPREHENSIVE: 'comprehensive', // Most thorough with risk matrix
};

/**
 * @typedef {object} ContractTypes
 * @property {string} EMPLOYMENT - Contract related to employment terms.
 * @property {string} NDA - Non-Disclosure Agreement.
 * @property {string} SERVICE_AGREEMENT - Agreement for services rendered.
 * @property {string} SALES - Contract for the sale of goods or services.
 * @property {string} LEASE - Agreement for property rental.
 * @property {string} PARTNERSHIP - Agreement between business partners.
 * @property {string} LICENSING - Agreement for intellectual property usage.
 * @property {string} PURCHASE - Agreement for buying goods or assets.
 * @property {string} VENDOR - Agreement with a supplier or vendor.
 * @property {string} INDEPENDENT_CONTRACTOR - Agreement with a self-employed individual.
 * @property {string} FRANCHISE - Agreement for operating a franchise.
 * @property {string} GENERAL - A generic or unspecified contract type.
 */
/**
 * Defines common types of legal contracts that the system can recognize or categorize.
 * @type {ContractTypes}
 */
export const CONTRACT_TYPES = {
  EMPLOYMENT: 'employment',
  NDA: 'nda',
  SERVICE_AGREEMENT: 'service_agreement',
  SALES: 'sales',
  LEASE: 'lease',
  PARTNERSHIP: 'partnership',
  LICENSING: 'licensing',
  PURCHASE: 'purchase',
  VENDOR: 'vendor',
  INDEPENDENT_CONTRACTOR: 'independent_contractor',
  FRANCHISE: 'franchise',
  GENERAL: 'general',
};

/**
 * @typedef {object} RiskLevels
 * @property {string} LOW - Minimal potential impact or likelihood.
 * @property {string} MEDIUM - Moderate potential impact or likelihood.
 * @property {string} HIGH - Significant potential impact or high likelihood.
 * @property {string} CRITICAL - Severe potential impact or almost certain likelihood, requiring immediate attention.
 */
/**
 * Defines standard risk levels used for categorizing identified risks in a contract review.
 * @type {RiskLevels}
 */
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// --- ADMIN & WORKSPACE MANAGEMENT CONSTANTS ---
// OPTIMIZATION: Centralized constants for Role-Based Access Control (RBAC),
// subscription plans, and usage limits. These are CRITICAL for ensuring proper
// validation, respecting tenant boundaries, and propagating usage details to admins.

/**
 * @typedef {object} RolePermissionsConfig
 * @property {string[]} user - Permissions for the standard user role.
 * @property {string[]} manager - Permissions for the manager role.
 * @property {string[]} admin - Permissions for the admin/workspace owner role.
 * @property {string[]} super_admin - Permissions for the super_admin/platform owner role.
 */
/**
 * Defines the allowed review depths for different user roles. This ensures that
 * feature access is properly controlled within the user hierarchy.
 * 'super_admin' and 'admin' have access to all depths, while 'manager' and 'user' have restricted access.
 * @type {RolePermissionsConfig}
 */
export const ROLE_PERMISSIONS = {
  user: [REVIEW_DEPTH.QUICK, REVIEW_DEPTH.STANDARD],
  manager: [REVIEW_DEPTH.QUICK, REVIEW_DEPTH.STANDARD, REVIEW_DEPTH.DETAILED],
  admin: [
    REVIEW_DEPTH.QUICK,
    REVIEW_DEPTH.STANDARD,
    REVIEW_DEPTH.DETAILED,
    REVIEW_DEPTH.COMPREHENSIVE,
  ],
  super_admin: [
    REVIEW_DEPTH.QUICK,
    REVIEW_DEPTH.STANDARD,
    REVIEW_DEPTH.DETAILED,
    REVIEW_DEPTH.COMPREHENSIVE,
  ],
};

/**
 * @typedef {object} FeatureAccess
 * @property {boolean} comprehensiveReview - Access to the most detailed review type.
 * @property {boolean} contractComparisonTool - Access to the multi-document comparison tool.
 * @property {boolean} customPrompts - Ability for admins to define custom review prompts for their workspace.
 */
/**
 * @typedef {object} PlanLimits
 * @property {number} reviewUnitsPerMonth - Monthly allowance of review units. -1 indicates unlimited.
 * @property {number} maxFileSize - Maximum file size in bytes for this plan.
 * @property {number} maxTeamMembers - Maximum number of team members allowed in the workspace. -1 indicates unlimited.
 * @property {FeatureAccess} featureAccess - A set of flags controlling access to specific premium features.
 */
/**
 * @typedef {object} FeatureLimitsByPlan
 * @property {PlanLimits} free - Limits for the free tier.
 * @property {PlanLimits} standard - Limits for the standard tier.
 * @property {PlanLimits} premium - Limits for the premium tier.
 * @property {PlanLimits} enterprise - Limits for the enterprise tier.
 */
/**
 * Defines feature limits based on workspace subscription plans (e.g., Stripe Plans).
 * This is critical for enforcing tenant-specific boundaries and managing resource allocation.
 * Usage data should be checked against these limits at the workspace/tenant level.
 * @type {FeatureLimitsByPlan}
 */
export const FEATURE_LIMITS_BY_PLAN = {
  free: {
    reviewUnitsPerMonth: 10,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxTeamMembers: 3,
    featureAccess: {
      comprehensiveReview: false,
      contractComparisonTool: false,
      customPrompts: false,
    },
  },
  standard: {
    reviewUnitsPerMonth: 100,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxTeamMembers: 20,
    featureAccess: {
      comprehensiveReview: false,
      contractComparisonTool: true,
      customPrompts: false,
    },
  },
  premium: {
    reviewUnitsPerMonth: 500,
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxTeamMembers: 100,
    featureAccess: {
      comprehensiveReview: true,
      contractComparisonTool: true,
      customPrompts: true,
    },
  },
  // IMPROVEMENT: Added an Enterprise plan for larger clients with higher/unlimited needs.
  enterprise: {
    reviewUnitsPerMonth: -1, // -1 indicates unlimited, often subject to fair use policy
    maxFileSize: 50 * 1024 * 1024, // 50MB or custom
    maxTeamMembers: -1, // Unlimited
    featureAccess: {
      comprehensiveReview: true,
      contractComparisonTool: true,
      customPrompts: true,
    },
  },
};

/**
 * @typedef {object} UsageTrackingConfig
 * @property {number} quick - Usage unit cost for a quick review.
 * @property {number} standard - Usage unit cost for a standard review.
 * @property {number} detailed - Usage unit cost for a detailed review.
 * @property {number} comprehensive - Usage unit cost for a comprehensive review.
 */
/**
 * Defines the relative "cost" in usage units for each review depth. This allows for
 * more accurate tracking and limit enforcement against the `reviewUnitsPerMonth` limit.
 * This information is vital for propagating usage details up to managers and admins.
 * @type {UsageTrackingConfig}
 */
export const USAGE_TRACKING_CONFIG = {
  [REVIEW_DEPTH.QUICK]: 0.5,
  [REVIEW_DEPTH.STANDARD]: 1,
  [REVIEW_DEPTH.DETAILED]: 2,
  [REVIEW_DEPTH.COMPREHENSIVE]: 4,
};

/**
 * @typedef {object} RateLimitConfig
 * @property {number} requests - Number of allowed requests.
 * @property {string} window - The time window for the limit (e.g., '1m', '1h').
 */
/**
 * @typedef {object} ApiRateLimitsByPlan
 * @property {RateLimitConfig} free - Rate limits for the free tier.
 * @property {RateLimitConfig} standard - Rate limits for the standard tier.
 * @property {RateLimitConfig} premium - Rate limits for the premium tier.
 * @property {RateLimitConfig} enterprise - Rate limits for the enterprise tier.
 */
/**
 * IMPROVEMENT: Defines API rate limits per subscription plan. This is crucial for platform
 * stability, preventing abuse, and ensuring fair resource allocation for all tenants.
 * These limits should be enforced at the middleware or API gateway level.
 * @type {ApiRateLimitsByPlan}
 */
export const API_RATE_LIMITS_BY_PLAN = {
  free: { requests: 60, window: '1m' }, // 60 requests per minute
  standard: { requests: 180, window: '1m' }, // 180 requests per minute
  premium: { requests: 300, window: '1m' }, // 300 requests per minute
  enterprise: { requests: 600, window: '1m' }, // 600 requests per minute or custom
};

/**
 * @typedef {object} DataRetentionDaysByPlan
 * @property {number} free - Data retention period in days for the free tier.
 * @property {number} standard - Data retention period in days for the standard tier.
 * @property {number} premium - Data retention period in days for the premium tier.
 * @property {number} enterprise - Data retention period in days for the enterprise tier.
 */
/**
 * IMPROVEMENT: Defines data retention policies based on subscription plans. This is a key
 * feature for compliance and data management that workspace owners need to be aware of.
 * -1 indicates indefinite retention.
 * @type {DataRetentionDaysByPlan}
 */
export const DATA_RETENTION_DAYS_BY_PLAN = {
  free: 90, // 90 days
  standard: 365, // 1 year
  premium: -1, // Indefinite
  enterprise: -1, // Indefinite or as per contract
};

// --- MODULE-SPECIFIC CONSTANTS ---

/**
 * The category identifier for conversations related to legal contract review.
 * Used for routing and context management within the AI assistant.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'legal_contract_review';

/**
 * The AI model specifically designated for handling conversational aspects
 * within the legal contract review module.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-1.5-pro'; // BUG FIX: Corrected model name from 'gemini-2.5-pro'

/**
 * @typedef {object} StorageConfig
 * @property {string} TEMP_FOLDER - The temporary folder path where uploaded contract files are stored.
 * @property {string} OUTPUT_FOLDER - The folder path where processed review outputs or generated documents are stored.
 */
/**
 * Configuration settings for file storage paths used by the legal contract review module.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/legal_contract_reviews',
  OUTPUT_FOLDER: 'output/contract_reviews',
};

/**
 * @typedef {object} RequiredParams
 * @property {Array<string>} general_review - Parameters required for a general review.
 * @property {Array<string>} clause_analysis - Parameters required for clause analysis.
 * @property {Array<string>} risk_assessment - Parameters required for risk assessment.
 * @property {Array<string>} compliance_check - Parameters required for compliance checks.
 * @property {Array<string>} fairness_evaluation - Parameters required for fairness evaluation.
 * @property {Array<string>} terminology_check - Parameters required for terminology checks.
 * @property {Array<string>} amendment_suggestions - Parameters required for amendment suggestions.
 * @property {Array<string>} comparison - Parameters required for contract comparison.
 * @property {Array<string>} summary - Parameters required for contract summary.
 * @property {Array<string>} clarification - Parameters required for clarification.
 * @property {Array<string>} unknown - Parameters required for unknown intent.
 */
/**
 * Maps each contract review intent to an array of parameters that are required
 * for that specific type of review. Currently, all are empty, implying no specific
 * additional parameters are strictly enforced beyond the contract itself.
 * @type {RequiredParams}
 */
export const REQUIRED_PARAMS = {
  [CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW]: [],
  [CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS]: [],
  [CONTRACT_REVIEW_INTENTS.RISK_ASSESSMENT]: [],
  [CONTRACT_REVIEW_INTENTS.COMPLIANCE_CHECK]: [],
  [CONTRACT_REVIEW_INTENTS.FAIRNESS_EVALUATION]: [],
  [CONTRACT_REVIEW_INTENTS.TERMINOLOGY_CHECK]: [],
  [CONTRACT_REVIEW_INTENTS.AMENDMENT_SUGGESTIONS]: [],
  [CONTRACT_REVIEW_INTENTS.COMPARISON]: [],
  [CONTRACT_REVIEW_INTENTS.SUMMARY]: [],
  // BUG FIX: Added missing intents for completeness to prevent potential runtime errors.
  [CONTRACT_REVIEW_INTENTS.CLARIFICATION]: [],
  [CONTRACT_REVIEW_INTENTS.UNKNOWN]: [],
};

/**
 * @typedef {object} DefaultParams
 * @property {string} reviewDepth - The default depth level for a contract review.
 * @property {string} contractType - The default contract type if not specified.
 * @property {string[]} aspects - An array of default aspects to focus on during a review.
 */
/**
 * Defines default parameters to be used when specific review settings are not provided by the user.
 * @type {DefaultParams}
 */
export const DEFAULT_PARAMS = {
  reviewDepth: REVIEW_DEPTH.STANDARD,
  contractType: CONTRACT_TYPES.GENERAL,
  aspects: [
    CONTRACT_REVIEW_ASPECTS.OBLIGATIONS,
    CONTRACT_REVIEW_ASPECTS.RIGHTS,
    CONTRACT_REVIEW_ASPECTS.LIABILITIES,
    CONTRACT_REVIEW_ASPECTS.TERMINATION,
  ],
};

/**
 * @typedef {object} SystemPrompts
 * @property {string} general_review - System prompt for a general contract review.
 * @property {string} clause_analysis - System prompt for detailed clause analysis.
 * @property {string} risk_assessment - System prompt for identifying and assessing risks.
 * @property {string} compliance_check - System prompt for checking legal and regulatory compliance.
 * @property {string} fairness_evaluation - System prompt for evaluating contract fairness.
 * @property {string} terminology_check - System prompt for reviewing legal terminology.
 * @property {string} amendment_suggestions - System prompt for suggesting contract amendments.
 * @property {string} comparison - System prompt for comparing contracts.
 * @property {string} summary - System prompt for generating a contract summary.
 * @property {string} clarification - System prompt for handling clarification requests.
 * @property {string} unknown - System prompt for handling unrecognized intents.
 * @property {string} CONVERSATIONAL_ASSISTANT - General system prompt for the AI's role as a conversational legal assistant.
 */
/**
 * A collection of system prompts tailored for different contract review intents.
 * These prompts guide the AI model on how to approach and respond to specific review requests.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  [CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW]: `You are an expert legal contract reviewer with extensive experience in contract law. Provide a comprehensive review of the legal contract covering key clauses, obligations, rights, liabilities, potential risks, and overall fairness. Be precise, professional, and highlight any red flags or concerning provisions.`,

  [CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS]: `You are an expert legal analyst specializing in contract clause analysis. Carefully examine each clause in the contract, explain its purpose, implications, and potential impact on the parties involved. Identify any ambiguous or problematic clauses that may require clarification or renegotiation.`,

  [CONTRACT_REVIEW_INTENTS.RISK_ASSESSMENT]: `You are a legal risk assessment specialist. Analyze the contract to identify and categorize all potential legal, financial, and operational risks. Provide a risk matrix with severity levels (low, medium, high, critical) and recommend mitigation strategies for each identified risk.`,

  [CONTRACT_REVIEW_INTENTS.COMPLIANCE_CHECK]: `You are a legal compliance expert. Review the contract for compliance with relevant laws, regulations, and industry standards. Identify any provisions that may violate statutory requirements or industry best practices. Provide recommendations for ensuring full legal compliance.`,

  [CONTRACT_REVIEW_INTENTS.FAIRNESS_EVALUATION]: `You are an impartial legal contract evaluator. Assess the fairness and balance of the contract terms between all parties. Identify any one-sided provisions, unconscionable terms, or clauses that disproportionately favor one party. Suggest amendments to achieve a more equitable agreement.`,

  [CONTRACT_REVIEW_INTENTS.TERMINOLOGY_CHECK]: `You are a legal terminology expert. Review the contract for proper use of legal terms, definitions, and language. Identify any ambiguous terms, missing definitions, or inconsistent terminology that could lead to disputes. Suggest precise legal language alternatives.`,

  [CONTRACT_REVIEW_INTENTS.AMENDMENT_SUGGESTIONS]: `You are a contract negotiation advisor. Based on your analysis of the contract, provide specific, actionable amendment suggestions to improve the terms. Focus on protecting the interests of your client while maintaining a reasonable and negotiable position.`,

  [CONTRACT_REVIEW_INTENTS.COMPARISON]: `You are a legal contract comparison specialist. Compare multiple versions or similar contracts to identify differences, improvements, or potential issues. Highlight significant changes and their implications.`,

  [CONTRACT_REVIEW_INTENTS.SUMMARY]: `You are a legal contract summarizer. Provide a clear, concise summary of the contract including: parties involved, purpose, key obligations, payment terms, duration, termination conditions, and any notable provisions. Make the summary accessible to non-legal professionals.`,

  // BUG FIX: Added missing system prompts for unhandled intents.
  [CONTRACT_REVIEW_INTENTS.CLARIFICATION]: `The user is asking for a clarification on a previous point. Review the conversation history and the contract text to provide a more detailed explanation or answer their specific question clearly and concisely.`,

  [CONTRACT_REVIEW_INTENTS.UNKNOWN]: `You are a helpful assistant. The user's request is unclear. Politely state that you don't understand and offer a list of specific actions you can perform, such as 'provide a general review', 'assess risks', or 'analyze a specific clause'.`,

  CONVERSATIONAL_ASSISTANT: `You are an intelligent legal contract review assistant. Your role is to:
1. Understand user requests about contract review
2. Analyze uploaded contracts or contract text
3. Ask clarifying questions when needed
4. Provide professional, accurate, and actionable legal contract reviews
5. Adapt to the user's specific needs and concerns
6. Explain legal concepts in clear, understandable language
7. Highlight risks, obligations, and important provisions
8. Suggest improvements when appropriate

Remember: You provide legal information and analysis, but always clarify that this is not a substitute for professional legal advice. Encourage users to consult with a licensed attorney for specific legal matters.`,
};

/**
 * @typedef {object} ResponseMessages
 * @property {string} NEED_CONTRACT - Message prompting the user to provide a contract.
 * @property {string} NEED_CLARIFICATION - Message requesting clarification from the user.
 * @property {string} REVIEW_COMPLETE - Confirmation message when a review is finished.
 * @property {string} FILE_UPLOADED - Confirmation message after a file has been uploaded.
 * @property {string} TEXT_PROVIDED - Confirmation message after contract text has been provided.
 * @property {string} UNKNOWN_INTENT - Message indicating the AI could not understand the user's intent.
 * @property {string} ERROR - Generic error message for processing failures.
 * @property {string} DISCLAIMER - Important legal disclaimer to be appended to AI responses.
 */
/**
 * A collection of standardized response messages used by the AI assistant
 * to communicate with users during the contract review process.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  NEED_CONTRACT:
    "I'd be happy to review a legal contract for you. Please provide the contract by either uploading the contract file (PDF, DOCX, DOC, or TXT) or by pasting the contract text in your message. What specific aspects of the contract would you like me to focus on?",

  NEED_CLARIFICATION:
    "I understand you'd like a contract review. To provide the most helpful analysis, could you please clarify: {clarification_needed}",

  REVIEW_COMPLETE: "I've completed the contract review. Here's my analysis:",

  FILE_UPLOADED:
    "I've received your contract file. What specific aspects would you like me to review? (e.g., obligations, risks, fairness, compliance, specific clauses)",

  TEXT_PROVIDED:
    "I've received the contract text. What type of review would you like? (e.g., general review, risk assessment, clause analysis, fairness evaluation)",

  UNKNOWN_INTENT:
    "I'm not sure I fully understand what you'd like me to review in the contract. Could you please be more specific? For example, you could ask me to:\n- Review the entire contract\n- Analyze specific clauses\n- Assess risks\n- Check for fairness\n- Evaluate compliance\n- Suggest amendments",

  ERROR:
    'I apologize, but I encountered an error while processing your request. Please try again or rephrase your request.',

  DISCLAIMER:
    '\n\n---\n**Important Legal Disclaimer:** This review is provided for informational purposes only and does not constitute legal advice. For specific legal matters, please consult with a qualified attorney licensed to practice in your jurisdiction.',
};

/**
 * @typedef {object} IntentKeywords
 * @property {string[]} general_review - Keywords associated with a general contract review.
 * @property {string[]} clause_analysis - Keywords associated with clause-specific analysis.
 * @property {string[]} risk_assessment - Keywords associated with risk identification and assessment.
 * @property {string[]} compliance_check - Keywords associated with checking legal compliance.
 * @property {string[]} fairness_evaluation - Keywords associated with evaluating contract fairness.
 * @property {string[]} terminology_check - Keywords associated with reviewing legal terminology.
 * @property {string[]} amendment_suggestions - Keywords associated with suggesting contract amendments.
 * @property {string[]} comparison - Keywords associated with comparing contracts.
 * @property {string[]} summary - Keywords associated with generating a contract summary.
 * @property {string[]} clarification - Keywords associated with clarification requests.
 */
/**
 * A mapping of contract review intents to arrays of keywords. These keywords are used
 * by the system to detect and classify the user's intent from their natural language input.
 * @type {IntentKeywords}
 */
export const INTENT_KEYWORDS = {
  [CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW]: [
    'review',
    'analyze',
    'check',
    'look at',
    'examine',
    'evaluate',
    'assessment',
  ],
  [CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS]: [
    'clause',
    'provision',
    'section',
    'term',
    'paragraph',
    'article',
  ],
  [CONTRACT_REVIEW_INTENTS.RISK_ASSESSMENT]: [
    'risk',
    'danger',
    'problem',
    'issue',
    'concern',
    'red flag',
    'warning',
  ],
  [CONTRACT_REVIEW_INTENTS.COMPLIANCE_CHECK]: [
    'compliance',
    'legal',
    'regulation',
    'law',
    'statute',
    'requirement',
  ],
  [CONTRACT_REVIEW_INTENTS.FAIRNESS_EVALUATION]: [
    'fair',
    'balanced',
    'one-sided',
    'equitable',
    'biased',
    'favorable',
  ],
  [CONTRACT_REVIEW_INTENTS.TERMINOLOGY_CHECK]: [
    'terminology',
    'definition',
    'term',
    'language',
    'wording',
    'phrasing',
  ],
  [CONTRACT_REVIEW_INTENTS.AMENDMENT_SUGGESTIONS]: [
    'amend',
    'change',
    'modify',
    'improve',
    'negotiate',
    'suggest',
    'recommendation',
  ],
  [CONTRACT_REVIEW_INTENTS.COMPARISON]: [
    'compare',
    'difference',
    'vs',
    'versus',
    'contrast',
  ],
  [CONTRACT_REVIEW_INTENTS.SUMMARY]: [
    'summary',
    'summarize',
    'overview',
    'brief',
    'key points',
  ],
  // BUG FIX: Added missing intents for more robust intent detection.
  [CONTRACT_REVIEW_INTENTS.CLARIFICATION]: [
    'clarify',
    'explain',
    'what do you mean',
    'elaborate',
    'in more detail',
  ],
  // The 'unknown' intent is a fallback and typically doesn't have associated keywords.
  [CONTRACT_REVIEW_INTENTS.UNKNOWN]: [],
};