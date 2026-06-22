/**
 * @fileoverview This file defines various constants used throughout the plan generation module.
 * It includes configurations for the AI model, plan types, complexity levels, stages,
 * system prompts, and other operational parameters.
 */

/**
 * Plan Generator Configuration.
 * Defines parameters and settings for the AI-powered plan generation process.
 * @constant
 * @type {object}
 * @property {string} MODEL - The primary AI model to use for plan generation.
 * @property {string} FALLBACK_MODEL - The fallback AI model to use if the primary model fails or is unavailable.
 * @property {number} TEMPERATURE_BRAINSTORM - The creativity temperature for brainstorming phases (0.0-1.0). Higher values mean more creative, less predictable output.
 * @property {number} TEMPERATURE_PLANNING - The creativity temperature for structured plan generation phases (0.0-1.0). Lower values mean more focused, less creative output.
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens the AI model can generate in a single response.
 * @property {number} MAX_FILE_SIZE - The maximum allowed size for uploaded files in bytes (e.g., for document analysis).
 * @property {string[]} SUPPORTED_MIME_TYPES - An array of MIME types for files that can be processed by the plan generator.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS - An array of file extensions for files that can be processed by the plan generator.
 */
export const PLAN_GENERATOR_CONFIG = {
  MODEL: 'gemini-2.5-pro',
  FALLBACK_MODEL: 'gemini-3.5-flash',
  TEMPERATURE_BRAINSTORM: 0.8,
  TEMPERATURE_PLANNING: 0.6,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
  SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.docx', '.doc', '.txt', '.xlsx', '.xls'],
};

/**
 * Platform roles for access control and hierarchy validation.
 * @constant
 * @type {object}
 * @property {string} SUPER_ADMIN - The highest-level role, typically for platform owners with unrestricted access.
 * @property {string} ADMIN - A high-level role for workspace owners, managing users and settings within their workspace.
 * @property {string} MANAGER - A mid-level role for team leaders, managing a group of users and their projects.
 * @property {string} USER - The standard role for end-users with basic access to the platform's features.
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin', // Platform Owner
  ADMIN: 'admin',             // Workspace Owner
  MANAGER: 'manager',         // Team Manager
  USER: 'user',               // End User
};

/**
 * Role hierarchy mapping to validate permissions.
 * Higher roles inherit permissions of lower roles.
 * @constant
 * @type {object}
 * @property {string[]} super_admin - Roles that a Super Admin can manage.
 * @property {string[]} admin - Roles that an Admin can manage.
 * @property {string[]} manager - Roles that a Manager can manage.
 * @property {string[]} user - Roles that a User can manage (none).
 */
export const ROLE_HIERARCHY = {
  [ROLES.SUPER_ADMIN]: [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  [ROLES.ADMIN]: [ROLES.MANAGER, ROLES.USER],
  [ROLES.MANAGER]: [ROLES.USER],
  [ROLES.USER]: [],
};

/**
 * Tenant and Workspace context configuration to enforce strict data isolation.
 * @constant
 * @type {object}
 * @property {string} TENANT_ID_HEADER - The HTTP header key for the tenant ID.
 * @property {string} WORKSPACE_ID_HEADER - The HTTP header key for the workspace ID.
 * @property {boolean} ENFORCE_STRICT_ISOLATION - Flag to enable or disable strict data isolation checks.
 */
export const TENANT_CONTEXT_CONFIG = {
  TENANT_ID_HEADER: 'x-tenant-id',
  WORKSPACE_ID_HEADER: 'x-workspace-id',
  ENFORCE_STRICT_ISOLATION: true,
};

/**
 * Configuration for propagating usage details, limits, and notifications
 * up the management and administrative hierarchy.
 * @constant
 * @type {object}
 * @property {boolean} PROPAGATE_TO_MANAGER - Whether to send usage notifications to managers.
 * @property {boolean} PROPAGATE_TO_ADMIN - Whether to send usage notifications to admins.
 * @property {boolean} PROPAGATE_TO_SUPER_ADMIN - Whether to send usage notifications to super admins.
 * @property {object} NOTIFICATION_TRIGGERS - Defines specific events that trigger notifications.
 * @property {string} NOTIFICATION_TRIGGERS.LIMIT_REACHED - Trigger when a usage limit is fully reached.
 * @property {string} NOTIFICATION_TRIGGERS.LIMIT_WARNING - Trigger when usage approaches a limit (e.g., 80%).
 * @property {string} NOTIFICATION_TRIGGERS.UNAUTHORIZED_ACCESS - Trigger on an unauthorized access attempt.
 * @property {string} NOTIFICATION_TRIGGERS.TENANT_CROSS_ACCESS_ATTEMPT - Trigger on a cross-tenant access attempt.
 * @property {number} WARNING_THRESHOLD_PERCENTAGE - The usage percentage that triggers a warning notification.
 */
export const USAGE_PROPAGATION_CONFIG = {
  PROPAGATE_TO_MANAGER: true,
  PROPAGATE_TO_ADMIN: true,
  PROPAGATE_TO_SUPER_ADMIN: true,
  NOTIFICATION_TRIGGERS: {
    LIMIT_REACHED: 'limit_reached',
    LIMIT_WARNING: 'limit_warning', // e.g., 80% usage
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    TENANT_CROSS_ACCESS_ATTEMPT: 'tenant_cross_access_attempt',
  },
  WARNING_THRESHOLD_PERCENTAGE: 80,
};

/**
 * Role-based limits and usage metrics configurations to ensure platform stability,
 * prevent abuse, and maintain strict user data isolation. Each role property contains an
 * object defining specific limits.
 * @constant
 * @type {object}
 * @property {object} super_admin - Usage limits for the Super Admin role.
 * @property {object} admin - Usage limits for the Admin role.
 * @property {object} manager - Usage limits for the Manager role.
 * @property {object} user - Usage limits for the User role.
 */
export const ROLE_BASED_LIMITS = {
  [ROLES.SUPER_ADMIN]: {
    MAX_PLANS: Infinity,
    MAX_CONVERSATIONS: Infinity,
    DAILY_PROMPT_LIMIT: Infinity,
    MAX_STORAGE_BYTES: Infinity,
    MAX_FILE_UPLOAD_COUNT: Infinity,
  },
  [ROLES.ADMIN]: {
    MAX_PLANS: 1000,
    MAX_CONVERSATIONS: 500,
    DAILY_PROMPT_LIMIT: 2000,
    MAX_STORAGE_BYTES: 10 * 1024 * 1024 * 1024, // 10GB
    MAX_FILE_UPLOAD_COUNT: 200,
  },
  [ROLES.MANAGER]: {
    MAX_PLANS: 250,
    MAX_CONVERSATIONS: 150,
    DAILY_PROMPT_LIMIT: 500,
    MAX_STORAGE_BYTES: 1 * 1024 * 1024 * 1024, // 1GB
    MAX_FILE_UPLOAD_COUNT: 50,
  },
  [ROLES.USER]: {
    MAX_PLANS: 100,
    MAX_CONVERSATIONS: 50,
    DAILY_PROMPT_LIMIT: 200,
    MAX_STORAGE_BYTES: 100 * 1024 * 1024, // 100MB
    MAX_FILE_UPLOAD_COUNT: 20,
  },
};

/**
 * Legacy user-level limits (maintained for backward compatibility).
 * This is an alias for the 'user' limits defined in {@link ROLE_BASED_LIMITS}.
 * @constant
 * @type {object}
 */
export const USER_LIMITS = ROLE_BASED_LIMITS[ROLES.USER];

/**
 * Defines the various types of plans that can be generated.
 * @constant
 * @type {object}
 * @property {string} BUSINESS_PLAN - A comprehensive plan outlining a business's objectives, strategies, and financial forecasts.
 * @property {string} PROJECT_PLAN - A detailed plan for a specific project, including tasks, timelines, and resources.
 * @property {string} PRODUCT_LAUNCH - A strategic plan for introducing a new product to the market.
 * @property {string} EVENT_PLAN - A plan for organizing and executing an event.
 * @property {string} MARKETING_CAMPAIGN - A plan for a series of marketing activities to achieve specific goals.
 * @property {string} RESEARCH_PLAN - A structured plan for conducting research, including methodology and objectives.
 * @property {string} CONTENT_STRATEGY - A plan for the creation, publication, and management of useful and usable content.
 * @property {string} STARTUP_PLAN - A plan specifically tailored for new businesses or startups.
 * @property {string} GENERAL - A generic plan type for ideas that don't fit specific categories or require a broad approach.
 */
export const PLAN_TYPES = {
  BUSINESS_PLAN: 'business_plan',
  PROJECT_PLAN: 'project_plan',
  PRODUCT_LAUNCH: 'product_launch',
  EVENT_PLAN: 'event_plan',
  MARKETING_CAMPAIGN: 'marketing_campaign',
  RESEARCH_PLAN: 'research_plan',
  CONTENT_STRATEGY: 'content_strategy',
  STARTUP_PLAN: 'startup_plan',
  GENERAL: 'general',
};

/**
 * Defines the complexity levels for plan generation, influencing the depth and detail of the output.
 * @constant
 * @type {object}
 * @property {string} SIMPLE - A plan suitable for short-term execution (1-2 weeks).
 * @property {string} MODERATE - A plan suitable for medium-term execution (1-3 months).
 * @property {string} COMPLEX - A plan suitable for long-term execution (3-12 months).
 * @property {string} ENTERPRISE - A plan suitable for very long-term or large-scale execution (12+ months).
 */
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple', // 1-2 weeks execution
  MODERATE: 'moderate', // 1-3 months
  COMPLEX: 'complex', // 3-12 months
  ENTERPRISE: 'enterprise', // 12+ months
};

/**
 * Defines the desired depth or level of detail for the generated plan.
 * @constant
 * @type {object}
 * @property {string} QUICK - Provides a high-level overview of the plan.
 * @property {string} STANDARD - Generates a detailed plan with standard sections.
 * @property {string} COMPREHENSIVE - Offers a deep dive into the plan, including alternatives and detailed analysis.
 * @property {string} STRATEGIC - Focuses on an executive-level plan with strategic insights and financial considerations.
 */
export const PLAN_DEPTH = {
  QUICK: 'quick', // High-level overview
  STANDARD: 'standard', // Detailed plan
  COMPREHENSIVE: 'comprehensive', // Deep dive with alternatives
  STRATEGIC: 'strategic', // Executive-level with financials
};

/**
 * Defines various aspects that can be covered during the brainstorming phase.
 * @constant
 * @type {object}
 * @property {string} MARKET_ANALYSIS - Focuses on understanding the target market, trends, and size.
 * @property {string} COMPETITIVE_LANDSCAPE - Analyzes competitors, their strengths, weaknesses, and market positioning.
 * @property {string} RESOURCE_NEEDS - Identifies required resources such as budget, personnel, tools, and time.
 * @property {string} TIMELINE_ESTIMATION - Provides estimates for project duration and key milestones.
 * @property {string} RISK_ASSESSMENT - Identifies potential risks and challenges, along with mitigation strategies.
 * @property {string} STAKEHOLDER_MAPPING - Identifies key stakeholders and their interests or influence.
 * @property {string} FINANCIAL_PROJECTIONS - Forecasts financial outcomes, including costs, revenue, and profitability.
 * @property {string} TECHNICAL_FEASIBILITY - Assesses the technical viability and requirements of the idea.
 * @property {string} SWOT_ANALYSIS - Performs a Strengths, Weaknesses, Opportunities, and Threats analysis.
 * @property {string} SUCCESS_METRICS - Defines key performance indicators (KPIs) and metrics for measuring success.
 */
export const BRAINSTORM_ASPECTS = {
  MARKET_ANALYSIS: 'market_analysis',
  COMPETITIVE_LANDSCAPE: 'competitive_landscape',
  RESOURCE_NEEDS: 'resource_needs',
  TIMELINE_ESTIMATION: 'timeline_estimation',
  RISK_ASSESSMENT: 'risk_assessment',
  STAKEHOLDER_MAPPING: 'stakeholder_mapping',
  FINANCIAL_PROJECTIONS: 'financial_projections',
  TECHNICAL_FEASIBILITY: 'technical_feasibility',
  SWOT_ANALYSIS: 'swot_analysis',
  SUCCESS_METRICS: 'success_metrics',
};

/**
 * Defines the different stages a plan goes through in the generation process.
 * @constant
 * @type {object}
 * @property {string} IDEA_ANALYSIS - The initial stage where the user's idea is analyzed and clarified.
 * @property {string} BRAINSTORMING - The stage where creative insights and strategic considerations are generated.
 * @property {string} PLAN_GENERATION - The stage where the structured plan document is created.
 * @property {string} REFINEMENT - The stage where the plan is adjusted and improved based on feedback.
 * @property {string} COMPLETED - The final stage indicating the plan generation process is finished.
 */
export const PLAN_STAGES = {
  IDEA_ANALYSIS: 'idea_analysis',
  BRAINSTORMING: 'brainstorming',
  PLAN_GENERATION: 'plan_generation',
  REFINEMENT: 'refinement',
  COMPLETED: 'completed',
};

/**
 * Defines various domains or areas of expertise relevant to plan generation.
 * @constant
 * @type {object}
 * @property {string} TECHNICAL - Pertaining to technology, software, hardware, or engineering.
 * @property {string} BUSINESS - Pertaining to business strategy, operations, and management.
 * @property {string} MARKETING - Pertaining to promotion, sales, and market engagement.
 * @property {string} FINANCIAL - Pertaining to money, budgeting, investments, and accounting.
 * @property {string} OPERATIONS - Pertaining to the processes and systems used to deliver products or services.
 * @property {string} LEGAL - Pertaining to laws, regulations, and compliance.
 * @property {string} DESIGN - Pertaining to user experience, aesthetics, and product design.
 * @property {string} HR - Pertaining to human resources, staffing, and organizational development.
 */
export const DOMAINS = {
  TECHNICAL: 'technical',
  BUSINESS: 'business',
  MARKETING: 'marketing',
  FINANCIAL: 'financial',
  OPERATIONS: 'operations',
  LEGAL: 'legal',
  DESIGN: 'design',
  HR: 'hr',
};

/**
 * The category identifier for conversations related to plan generation.
 * @constant
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'plan_generation';

/**
 * The AI model used for general conversational interactions within the plan generation module.
 * @constant
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-2.5-pro';

/**
 * Defines default parameters for plan generation requests.
 * @constant
 * @type {object}
 * @property {string} planDepth - The default depth of the plan, referencing {@link PLAN_DEPTH}.
 * @property {string} complexity - The default complexity level of the plan, referencing {@link COMPLEXITY_LEVELS}.
 * @property {string} planType - The default type of plan, referencing {@link PLAN_TYPES}.
 * @property {string[]} brainstormAspects - An array of default brainstorming aspects to include, referencing {@link BRAINSTORM_ASPECTS}.
 */
export const DEFAULT_PARAMS = {
  planDepth: PLAN_DEPTH.STANDARD,
  complexity: COMPLEXITY_LEVELS.MODERATE,
  planType: PLAN_TYPES.GENERAL,
  brainstormAspects: [
    BRAINSTORM_ASPECTS.SWOT_ANALYSIS,
    BRAINSTORM_ASPECTS.RESOURCE_NEEDS,
    BRAINSTORM_ASPECTS.RISK_ASSESSMENT,
  ],
};

/**
 * Defines system prompts used by the AI for different stages of the plan generation process.
 * These prompts guide the AI's persona and task for each specific stage.
 * Strict instructions are embedded to ensure user data isolation and privacy.
 * @constant
 * @type {object}
 * @property {string} IDEA_ANALYSIS - Prompt for the AI when analyzing a user's initial idea.
 * @property {string} BRAINSTORMING - Prompt for the AI during the brainstorming phase.
 * @property {string} PLAN_GENERATION - Prompt for the AI when generating the structured plan.
 * @property {string} REFINEMENT - Prompt for the AI when refining an existing plan based on feedback.
 * @property {string} CONVERSATIONAL - Prompt for the AI when engaging in general conversational assistance for planning.
 */
export const SYSTEM_PROMPTS = {
  IDEA_ANALYSIS: `You are an expert business analyst and strategic planner. Your role is to:
1. Analyze the user's idea thoroughly to understand its scope, feasibility, and requirements
2. Identify the type of plan needed (business, project, product launch, etc.)
3. Assess the complexity level and required domains
4. Determine clarity score - how well-defined the idea is
5. Ask intelligent, strategic clarifying questions if the idea is vague
6. Extract key requirements, constraints, and goals

CRITICAL: Maintain strict user data isolation. Never reference, assume, or leak any information outside of the current user's provided context and active session.
Be professional, insightful, and help users refine their ideas into actionable plans.`,

  BRAINSTORMING: `You are a creative brainstorming expert and strategic consultant. Your role is to:
1. Generate comprehensive insights covering multiple perspectives
2. Perform SWOT Analysis (Strengths, Weaknesses, Opportunities, Threats)
3. Identify stakeholders and their interests
4. Estimate resource requirements (budget, team, tools, time)
5. Analyze market opportunities and competitive landscape
6. Identify potential challenges and risks
7. Suggest success metrics and KPIs
8. Provide alternative approaches and strategies

CRITICAL: Maintain strict user data isolation. Never reference, assume, or leak any information outside of the current user's provided context and active session.
Think creatively but remain practical. Consider short-term and long-term implications.`,

  PLAN_GENERATION: `You are a professional project planner and strategist. Your role is to:
1. Create a detailed, actionable plan based on the brainstorming insights
2. Structure the plan with clear sections: Executive Summary, Objectives, Phases, Action Items, Resources, Risks, Metrics
3. Use SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound)
4. Break down the plan into logical phases with milestones
5. Prioritize tasks and define dependencies
6. Estimate realistic timelines and resource allocation
7. Include risk mitigation strategies
8. Define clear success metrics and KPIs

CRITICAL: Maintain strict user data isolation. Never reference, assume, or leak any information outside of the current user's provided context and active session.
Format your output as a well-structured, professional plan document. Be specific and actionable.`,

  REFINEMENT: `You are a plan optimization expert. Your role is to:
1. Refine and improve existing plans based on user feedback
2. Adjust specific sections while maintaining overall coherence
3. Optimize for different constraints (budget, timeline, resources)
4. Provide alternative approaches when requested
5. Ensure all changes are practical and feasible

CRITICAL: Maintain strict user data isolation. Never reference, assume, or leak any information outside of the current user's provided context and active session.
Maintain consistency with the original plan while incorporating improvements. Be responsive to user needs.`,

  CONVERSATIONAL: `You are an intelligent planning assistant helping users develop comprehensive plans for their ideas. You can:
1. Understand natural language descriptions of ideas
2. Ask clarifying questions to better understand requirements
3. Generate creative brainstorming insights
4. Create detailed, structured plans
5. Refine plans based on feedback
6. Explain specific sections or provide alternatives

CRITICAL: Maintain strict user data isolation. Never reference, assume, or leak any information outside of the current user's provided context and active session.
Be conversational, helpful, and professional. Guide users through the planning process step by step.`,
};

/**
 * Standardized response messages used by the plan generation module.
 * @constant
 * @type {object}
 * @property {string} PLAN_GENERATED - Message indicating a plan was successfully generated.
 * @property {string} BRAINSTORM_COMPLETED - Message indicating the brainstorming session is complete.
 * @property {string} REFINEMENT_APPLIED - Message indicating plan refinements were successfully applied.
 * @property {string} CLARIFICATION_NEEDED - Message indicating that more information is required from the user.
 * @property {string} INVALID_IDEA - Message indicating the provided idea description is insufficient.
 * @property {string} FILE_UPLOADED - Message indicating a file was successfully uploaded and analyzed.
 * @property {string} CONVERSATION_CREATED - Message indicating a new planning conversation has been initiated.
 * @property {string} EXPORT_READY - Message indicating the plan is ready for export.
 * @property {string} LIMIT_EXCEEDED - Message indicating user-level limits have been exceeded.
 * @property {string} STORAGE_FULL - Message indicating personal storage limit has been reached.
 * @property {string} UNAUTHORIZED_ROLE - Message indicating role validation failure.
 * @property {string} TENANT_MISMATCH - Message indicating tenant boundary violation.
 */
export const RESPONSE_MESSAGES = {
  PLAN_GENERATED: 'Plan generated successfully',
  BRAINSTORM_COMPLETED: 'Brainstorming session completed',
  REFINEMENT_APPLIED: 'Plan refinement applied successfully',
  CLARIFICATION_NEEDED:
    'I need more information to create a comprehensive plan',
  INVALID_IDEA: 'Please provide a more detailed description of your idea',
  FILE_UPLOADED: 'File uploaded and analyzed successfully',
  CONVERSATION_CREATED: 'New planning conversation created',
  EXPORT_READY: 'Plan exported successfully',
  LIMIT_EXCEEDED: 'Usage limit exceeded. Please upgrade your plan or try again later.',
  STORAGE_FULL: 'Personal file storage limit exceeded. Please delete some files to free up space.',
  UNAUTHORIZED_ROLE: 'You do not have the required role permissions to perform this action.',
  TENANT_MISMATCH: 'Access denied: Tenant context boundary violation detected.',
};

/**
 * Defines the standard sections that can be included in a generated plan.
 * @constant
 * @type {object}
 * @property {string} EXECUTIVE_SUMMARY - A brief overview of the entire plan.
 * @property {string} OBJECTIVES - The specific goals the plan aims to achieve.
 * @property {string} PHASES - The major stages or steps of the plan.
 * @property {string} ACTION_ITEMS - Specific tasks or activities to be performed.
 * @property {string} RESOURCES - Required assets, personnel, or budget.
 * @property {string} RISKS - Potential challenges and mitigation strategies.
 * @property {string} METRICS - Key performance indicators for measuring success.
 * @property {string} TIMELINE - The schedule and deadlines for the plan.
 * @property {string} BUDGET - Financial allocation and cost estimates.
 * @property {string} STAKEHOLDERS - Identified individuals or groups involved or affected.
 * @property {string} ALTERNATIVES - Alternative approaches or strategies considered.
 */
export const PLAN_SECTIONS = {
  EXECUTIVE_SUMMARY: 'executive_summary',
  OBJECTIVES: 'objectives',
  PHASES: 'phases',
  ACTION_ITEMS: 'action_items',
  RESOURCES: 'resources',
  RISKS: 'risks',
  METRICS: 'metrics',
  TIMELINE: 'timeline',
  BUDGET: 'budget',
  STAKEHOLDERS: 'stakeholders',
  ALTERNATIVES: 'alternatives',
};

/**
 * Defines thresholds for assessing the clarity of a user's idea.
 * These scores help determine if further clarification is needed.
 * @constant
 * @type {object}
 * @property {number} VERY_CLEAR - Idea is well-defined and ready for planning (score >= 0.8).
 * @property {number} CLEAR - Idea is understandable, minor clarifications needed (score >= 0.6).
 * @property {number} MODERATE - Idea needs significant clarification (score >= 0.4).
 * @property {number} UNCLEAR - Idea is too vague, major clarifications needed (score >= 0.2).
 */
export const CLARITY_THRESHOLDS = {
  VERY_CLEAR: 0.8, // Idea is well-defined, ready for planning
  CLEAR: 0.6, // Idea is understandable, minor clarifications needed
  MODERATE: 0.4, // Idea needs significant clarification
  UNCLEAR: 0.2, // Idea is too vague, major clarifications needed
};

/**
 * Defines the supported formats for exporting generated plans.
 * @constant
 * @type {object}
 * @property {string} PDF - Portable Document Format.
 * @property {string} DOCX - Microsoft Word Document (Open XML).
 * @property {string} JSON - JavaScript Object Notation.
 * @property {string} MARKDOWN - Markdown text format.
 * @property {string} HTML - HyperText Markup Language.
 */
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  JSON: 'json',
  MARKDOWN: 'markdown',
  HTML: 'html',
};

/**
 * Defines the possible statuses for a generated plan.
 * @constant
 * @type {object}
 * @property {string} DRAFT - The plan is in its initial, incomplete stage.
 * @property {string} ACTIVE - The plan is currently being worked on or is in use.
 * @property {string} COMPLETED - The plan has been finalized.
 * @property {string} ARCHIVED - The plan is no longer active but kept for reference.
 */
export const PLAN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

/**
 * Provides templates for clarification questions based on the plan type.
 * These questions help the AI gather more information from the user when an idea is vague.
 * @constant
 * @type {object}
 * @property {string[]} BUSINESS_PLAN - Questions specific to business plans.
 * @property {string[]} PRODUCT_LAUNCH - Questions specific to product launch plans.
 * @property {string[]} EVENT_PLAN - Questions specific to event plans.
 * @property {string[]} MARKETING_CAMPAIGN - Questions specific to marketing campaigns.
 * @property {string[]} GENERAL - General clarification questions applicable to any plan type.
 */
export const CLARIFICATION_QUESTIONS = {
  BUSINESS_PLAN: [
    'What is your target market or customer segment?',
    'What is your estimated budget range?',
    'What is your timeline for launch or implementation?',
    'Who are your main competitors?',
    'What unique value does your idea provide?',
  ],
  PRODUCT_LAUNCH: [
    'What problem does your product solve?',
    'Who is your target audience?',
    'What is your go-to-market strategy?',
    'What is your pricing model?',
    'What resources do you currently have?',
  ],
  EVENT_PLAN: [
    'What type of event are you planning?',
    'How many attendees do you expect?',
    'What is your budget?',
    'When do you want to hold the event?',
    "What is the event's main objective?",
  ],
  MARKETING_CAMPAIGN: [
    'What is your campaign objective?',
    'Who is your target audience?',
    'What channels will you use?',
    'What is your budget?',
    'What is your success metric?',
  ],
  GENERAL: [
    'Can you provide more details about your idea?',
    'What is your main goal or objective?',
    'What resources do you have available?',
    'What is your timeline?',
    'What challenges do you anticipate?',
  ],
};