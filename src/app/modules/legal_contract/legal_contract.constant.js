/**
 * @fileoverview This file defines various constants and configurations related to the legal contract generation module.
 * It includes settings for AI models, contract types, intents, jurisdictions, complexity levels, system prompts,
 * response messages, and default parameters for contract creation.
 */

// Legal Contract Configuration
/**
 * @constant {object} LEGAL_CONTRACT_CONFIG - Configuration settings for the legal contract generation AI.
 * @property {string} MODEL - The AI model to use for contract generation.
 * @property {number} TEMPERATURE - The creativity/randomness of the AI's output. Lower values (e.g., 0.3) are preferred for precise legal language.
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens the AI model can generate in a single response.
 * @property {number} MAX_FILE_SIZE - The maximum allowed size for uploaded files (e.g., contract drafts) in bytes (10MB).
 * @property {number} MAX_CACHED_TEXT_SIZE - The maximum size for text content that can be cached for processing in bytes (1MB).
 * @property {string[]} SUPPORTED_MIME_TYPES - An array of MIME types for documents that the system can process.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS - An array of file extensions for documents that the system can process.
 * @property {number} MAX_QUESTIONS - The maximum number of AI-generated questions to ask the user for contract details.
 * @property {number} MIN_QUESTIONS - The minimum number of AI-generated questions to ask before proceeding with contract generation.
 */
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
/**
 * @constant {object} CONTRACT_TYPES - Defines the various types of legal contracts supported by the system.
 * @property {string} EMPLOYMENT - Represents an employment contract.
 * @property {string} NDA - Represents a Non-Disclosure Agreement.
 * @property {string} SERVICE_AGREEMENT - Represents a service agreement.
 * @property {string} LEASE - Represents a lease agreement.
 * @property {string} SALES - Represents a sales agreement.
 * @property {string} PARTNERSHIP - Represents a partnership agreement.
 * @property {string} CONSULTING - Represents a consulting agreement.
 * @property {string} FREELANCE - Represents a freelance contract.
 * @property {string} LICENSE - Represents a license agreement.
 * @property {string} VENDOR - Represents a vendor agreement.
 * @property {string} LOAN - Represents a loan agreement.
 * @property {string} INDEPENDENT_CONTRACTOR - Represents an independent contractor agreement.
 * @property {string} GENERAL - Represents a general or unspecified contract type.
 */
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
/**
 * @constant {object} CONTRACT_INTENTS - Defines the different intentions or actions a user might have regarding a contract.
 * @property {string} CREATE_CONTRACT - User intends to create a new contract.
 * @property {string} ANSWER_QUESTION - User is providing an answer to a previously asked question.
 * @property {string} MODIFY_CONTRACT - User intends to modify an existing contract.
 * @property {string} CLARIFICATION - User is seeking or providing clarification.
 * @property {string} REQUEST_FILE - User is requesting to upload a file.
 * @property {string} UNKNOWN - The user's intent could not be determined.
 */
export const CONTRACT_INTENTS = {
  CREATE_CONTRACT: 'create_contract',
  ANSWER_QUESTION: 'answer_question',
  MODIFY_CONTRACT: 'modify_contract',
  CLARIFICATION: 'clarification',
  REQUEST_FILE: 'request_file',
  UNKNOWN: 'unknown',
};

// Contract jurisdictions
/**
 * @constant {object} JURISDICTIONS - Defines various legal jurisdictions applicable to contracts.
 * @property {string} US_FEDERAL - United States Federal jurisdiction.
 * @property {string} US_STATE - United States State-specific jurisdiction.
 * @property {string} UK - United Kingdom jurisdiction.
 * @property {string} EU - European Union jurisdiction.
 * @property {string} INTERNATIONAL - International jurisdiction.
 * @property {string} OTHER - Other or unspecified jurisdiction.
 */
export const JURISDICTIONS = {
  US_FEDERAL: 'us_federal',
  US_STATE: 'us_state',
  UK: 'uk',
  EU: 'eu',
  INTERNATIONAL: 'international',
  OTHER: 'other',
};

// Contract complexity levels
/**
 * @constant {object} COMPLEXITY_LEVELS - Defines the different levels of complexity for contracts.
 * @property {string} SIMPLE - A basic contract with standard terms.
 * @property {string} STANDARD - A standard business contract.
 * @property {string} DETAILED - A comprehensive contract with many clauses.
 * @property {string} COMPLEX - A complex multi-party or specialized contract.
 */
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple', // Basic contract with standard terms
  STANDARD: 'standard', // Standard business contract
  DETAILED: 'detailed', // Comprehensive with many clauses
  COMPLEX: 'complex', // Complex multi-party or specialized
};

// Conversation configuration
/**
 * @constant {string} CONVERSATION_CATEGORY - The category identifier for legal contract related conversations.
 */
export const CONVERSATION_CATEGORY = 'legal_contract';
/**
 * @constant {string} CONVERSATION_MODEL - The AI model to use for general conversation within the legal contract module.
 */
export const CONVERSATION_MODEL = 'gemini-2.5-pro';

// Output formats
/**
 * @constant {object} OUTPUT_FORMATS - Defines the supported output formats for generated contracts.
 * @property {string} TEXT - Plain text format.
 * @property {string} DOCX - Microsoft Word document format.
 * @property {string} PDF - Portable Document Format.
 */
export const OUTPUT_FORMATS = {
  TEXT: 'text',
  DOCX: 'docx',
  PDF: 'pdf',
};

// System prompts for different contract types
/**
 * @constant {object} SYSTEM_PROMPTS - A collection of system prompts used to guide the AI for different tasks and contract types.
 * @property {string} QUESTION_GENERATOR - System prompt for the AI to generate essential questions for contract drafting.
 * @property {string} [CONTRACT_TYPES.EMPLOYMENT] - System prompt for generating an employment contract.
 * @property {string} [CONTRACT_TYPES.NDA] - System prompt for generating a Non-Disclosure Agreement.
 * @property {string} [CONTRACT_TYPES.SERVICE_AGREEMENT] - System prompt for generating a service agreement.
 * @property {string} [CONTRACT_TYPES.FREELANCE] - System prompt for generating a freelance contract.
 * @property {string} [CONTRACT_TYPES.CONSULTING] - System prompt for generating a consulting agreement.
 * @property {string} [CONTRACT_TYPES.LEASE] - System prompt for generating a lease agreement.
 * @property {string} [CONTRACT_TYPES.PARTNERSHIP] - System prompt for generating a partnership agreement.
 * @property {string} [CONTRACT_TYPES.SALES] - System prompt for generating a sales agreement.
 * @property {string} [CONTRACT_TYPES.GENERAL] - System prompt for generating a general contract.
 */
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
/**
 * @constant {object} RESPONSE_MESSAGES - Standardized response messages used by the legal contract module.
 * @property {string} QUESTIONS_GENERATED - Message indicating that essential questions have been generated for the user.
 * @property {string} CONTRACT_GENERATED - Message indicating that the contract has been generated, along with a disclaimer.
 * @property {string} FILE_PROCESSED - Message indicating that an uploaded document has been reviewed.
 * @property {string} INSUFFICIENT_INFO - Message indicating that more information is needed from the user.
 * @property {string} ERROR_GENERATING - Message for when an error occurs during contract generation.
 * @property {string} FILE_REQUIRED - Message prompting the user to upload relevant documents or provide details.
 * @property {string} CLARIFICATION_NEEDED - Message indicating that clarification is required from the user.
 * @property {string} DISCLAIMER - A legal disclaimer to be appended to AI-generated contracts.
 */
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
/**
 * @constant {object} DEFAULT_PARAMS - Default parameters used when initiating a contract generation request.
 * @property {string} contractType - The default type of contract to generate, using values from {@link CONTRACT_TYPES}.
 * @property {string} complexity - The default complexity level for the contract, using values from {@link COMPLEXITY_LEVELS}.
 * @property {string} jurisdiction - The default legal jurisdiction for the contract, using values from {@link JURISDICTIONS}.
 * @property {string} outputFormat - The default output format for the generated contract, using values from {@link OUTPUT_FORMATS}.
 * @property {boolean} includeBoilerplate - Flag indicating whether standard boilerplate clauses should be included by default.
 * @property {Array<object>} questionsAsked - An array to track questions that have been asked to the user.
 * @property {object} answersProvided - An object to store answers provided by the user to questions.
 */
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
/**
 * @constant {object} QUESTION_STATUS - Defines the possible statuses for a question in the contract generation flow.
 * @property {string} PENDING - The question has been asked but not yet answered.
 * @property {string} ANSWERED - The question has been answered by the user.
 * @property {string} SKIPPED - The question was skipped by the user or deemed unnecessary.
 */
export const QUESTION_STATUS = {
  PENDING: 'pending',
  ANSWERED: 'answered',
  SKIPPED: 'skipped',
};