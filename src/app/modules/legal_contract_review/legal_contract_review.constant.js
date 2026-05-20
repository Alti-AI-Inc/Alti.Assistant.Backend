// Legal Contract Review Configuration
export const LEGAL_CONTRACT_REVIEW_CONFIG = {
  MODEL: 'gemini-3.5-flash',
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

// Review intents
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

// Contract review aspects
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

// Review depth levels
export const REVIEW_DEPTH = {
  QUICK: 'quick', // Quick overview of key clauses
  STANDARD: 'standard', // Standard comprehensive review
  DETAILED: 'detailed', // Detailed clause-by-clause analysis
  COMPREHENSIVE: 'comprehensive', // Most thorough with risk matrix
};

// Contract types
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

// Risk levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'legal_contract_review';
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

// Storage configuration
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/legal_contract_reviews',
  OUTPUT_FOLDER: 'output/contract_reviews',
};

// Required parameters for review
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
};

// Default parameters
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

// System prompts for different review types
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

// Response messages
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

// Intent detection keywords
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
};
