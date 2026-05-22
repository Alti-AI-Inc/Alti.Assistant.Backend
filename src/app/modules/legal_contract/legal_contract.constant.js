// Legal Contract Configuration
export const LEGAL_CONTRACT_CONFIG = {
  MODEL: 'gemini-3.5-flash',
  TEMPERATURE: 0.3, // Lower temperature for more precise legal language
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
  MAX_QUESTIONS: 5, // Maximum AI-generated questions to ask
  MIN_QUESTIONS: 2, // Minimum questions before generating contract
};

// Contract types
export const CONTRACT_TYPES = {
  EMPLOYMENT: 'employment',
  NDA: 'nda',
  SERVICE_AGREEMENT: 'service_agreement',
  LEASE: 'lease',
  SALES: 'sales',
  PARTNERSHIP: 'partnership',
  CONSULTING: 'consulting',
  FREELANCE: 'freelance',
  LICENSE: 'license',
  VENDOR: 'vendor',
  LOAN: 'loan',
  INDEPENDENT_CONTRACTOR: 'independent_contractor',
  GENERAL: 'general',
};

// Contract intents
export const CONTRACT_INTENTS = {
  CREATE_CONTRACT: 'create_contract',
  ANSWER_QUESTION: 'answer_question',
  MODIFY_CONTRACT: 'modify_contract',
  CLARIFICATION: 'clarification',
  REQUEST_FILE: 'request_file',
  UNKNOWN: 'unknown',
};

// Contract jurisdictions
export const JURISDICTIONS = {
  US_FEDERAL: 'us_federal',
  US_STATE: 'us_state',
  UK: 'uk',
  EU: 'eu',
  INTERNATIONAL: 'international',
  OTHER: 'other',
};

// Contract complexity levels
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple', // Basic contract with standard terms
  STANDARD: 'standard', // Standard business contract
  DETAILED: 'detailed', // Comprehensive with many clauses
  COMPLEX: 'complex', // Complex multi-party or specialized
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'legal_contract';
export const CONVERSATION_MODEL = 'gemini-3.1-pro';

// Output formats
export const OUTPUT_FORMATS = {
  TEXT: 'text',
  DOCX: 'docx',
  PDF: 'pdf',
};

// System prompts for different contract types
export const SYSTEM_PROMPTS = {
  QUESTION_GENERATOR: `You are a legal expert AI assistant specialized in contract drafting. Your task is to analyze the user's request and any provided context to generate ESSENTIAL questions that MUST be answered before creating a legally sound contract.

CRITICAL RULES:
1. Generate between ${LEGAL_CONTRACT_CONFIG.MIN_QUESTIONS} and ${LEGAL_CONTRACT_CONFIG.MAX_QUESTIONS} questions ONLY
2. Ask ONLY what is absolutely necessary - avoid overwhelming the user
3. Prioritize the most critical legal requirements first
4. Make questions clear, specific, and easy to answer
5. If context is already provided, don't ask for it again
6. Focus on information that significantly impacts the contract structure
7. Avoid generic questions - be specific to the contract type

Return your response in this JSON format:
{
  "questions": [
    {
      "id": "q1",
      "question": "Clear, specific question?",
      "reason": "Why this is essential for the contract",
      "type": "text|date|choice|number",
      "options": ["option1", "option2"] // Only for choice type
    }
  ],
  "contractType": "identified_contract_type",
  "summary": "Brief summary of what contract will be created"
}`,

  [CONTRACT_TYPES.EMPLOYMENT]: `You are a legal expert specializing in employment contracts. Create a professional, legally sound employment agreement that:
- Clearly defines the employment relationship and terms
- Includes appropriate clauses for compensation, benefits, and termination
- Protects both employer and employee interests
- Uses clear, unambiguous language
- Complies with applicable employment laws
- Includes standard provisions like confidentiality, IP assignment, and dispute resolution

Format the contract professionally with proper sections and subsections.`,

  [CONTRACT_TYPES.NDA]: `You are a legal expert specializing in non-disclosure agreements. Create a comprehensive NDA that:
- Clearly defines confidential information
- Specifies obligations and restrictions
- Includes appropriate duration and scope
- Addresses both mutual and one-way scenarios
- Protects intellectual property
- Includes remedies for breach
- Uses precise legal terminology

Format the contract professionally with numbered clauses.`,

  [CONTRACT_TYPES.SERVICE_AGREEMENT]: `You are a legal expert specializing in service agreements. Create a detailed service contract that:
- Clearly describes the services to be provided
- Defines scope, deliverables, and timelines
- Specifies payment terms and conditions
- Includes liability limitations and indemnification
- Addresses termination conditions
- Covers warranties and representations
- Includes dispute resolution mechanisms

Format the contract with clear sections and professional structure.`,

  [CONTRACT_TYPES.FREELANCE]: `You are a legal expert specializing in freelance agreements. Create a freelance contract that:
- Defines the independent contractor relationship
- Specifies project scope and deliverables
- Outlines payment terms and schedule
- Addresses intellectual property ownership
- Includes liability limitations
- Covers termination clauses
- Protects both parties' interests

Format the contract in a clear, professional manner.`,

  [CONTRACT_TYPES.CONSULTING]: `You are a legal expert specializing in consulting agreements. Create a consulting contract that:
- Defines consulting services and expertise
- Specifies engagement terms and duration
- Outlines fees and payment structure
- Includes confidentiality provisions
- Addresses liability and indemnification
- Covers intellectual property rights
- Includes non-compete if applicable

Format professionally with appropriate legal structure.`,

  [CONTRACT_TYPES.LEASE]: `You are a legal expert specializing in lease agreements. Create a lease contract that:
- Identifies property and parties clearly
- Specifies lease term and rent details
- Outlines tenant and landlord obligations
- Includes maintenance responsibilities
- Addresses security deposit terms
- Covers termination and renewal
- Includes standard lease provisions

Format with clear sections and legal precision.`,

  [CONTRACT_TYPES.PARTNERSHIP]: `You are a legal expert specializing in partnership agreements. Create a partnership contract that:
- Defines partnership structure and purpose
- Specifies capital contributions
- Outlines profit/loss distribution
- Defines decision-making authority
- Addresses partner responsibilities
- Covers dissolution procedures
- Includes dispute resolution

Format with comprehensive sections and legal clarity.`,

  [CONTRACT_TYPES.SALES]: `You are a legal expert specializing in sales agreements. Create a sales contract that:
- Clearly describes goods/services being sold
- Specifies purchase price and payment terms
- Includes delivery terms and conditions
- Addresses warranties and guarantees
- Covers risk of loss
- Includes remedies for breach
- Specifies governing law

Format professionally with standard contract structure.`,

  [CONTRACT_TYPES.GENERAL]: `You are a legal expert specializing in contract drafting. Create a professional, legally sound contract that:
- Addresses the specific needs described by the user
- Uses clear, precise legal language
- Includes all necessary standard clauses
- Protects all parties' interests
- Ensures legal enforceability
- Follows best practices for contract structure
- Includes appropriate legal provisions

Format the contract professionally with proper organization.`,
};

// Response messages
export const RESPONSE_MESSAGES = {
  QUESTIONS_GENERATED:
    'I need to ask you a few essential questions to create a proper legal contract. Please provide answers to help me draft the contract accurately.',
  CONTRACT_GENERATED:
    'I have generated your legal contract based on the information provided. Please review it carefully. This is a draft and should be reviewed by a qualified attorney before use.',
  FILE_PROCESSED:
    'I have reviewed the uploaded document. Now, let me ask a few questions to create the contract.',
  INSUFFICIENT_INFO:
    'I need more information to create a comprehensive contract. Please answer the questions above.',
  ERROR_GENERATING:
    'I encountered an error while generating the contract. Please try again or provide more details.',
  FILE_REQUIRED:
    'Please upload any relevant documents or provide detailed information about the contract you need.',
  CLARIFICATION_NEEDED:
    'I need clarification on some points before generating the contract.',
  DISCLAIMER:
    '\n\n⚠️ LEGAL DISCLAIMER: This contract is generated by AI and is provided as a draft template only. It should be reviewed and customized by a qualified attorney familiar with your jurisdiction and specific circumstances before use. The AI cannot provide legal advice.',
};

// Default parameters
export const DEFAULT_PARAMS = {
  contractType: CONTRACT_TYPES.GENERAL,
  complexity: COMPLEXITY_LEVELS.STANDARD,
  jurisdiction: JURISDICTIONS.INTERNATIONAL,
  outputFormat: OUTPUT_FORMATS.TEXT,
  includeBoilerplate: true,
  questionsAsked: [],
  answersProvided: {},
};

// Question tracking
export const QUESTION_STATUS = {
  PENDING: 'pending',
  ANSWERED: 'answered',
  SKIPPED: 'skipped',
};
