// Plan Generator Configuration
export const PLAN_GENERATOR_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  FALLBACK_MODEL: 'gemini-3-flash-preview',
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

// Plan types
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

// Complexity levels
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple', // 1-2 weeks execution
  MODERATE: 'moderate', // 1-3 months
  COMPLEX: 'complex', // 3-12 months
  ENTERPRISE: 'enterprise', // 12+ months
};

// Plan depth
export const PLAN_DEPTH = {
  QUICK: 'quick', // High-level overview
  STANDARD: 'standard', // Detailed plan
  COMPREHENSIVE: 'comprehensive', // Deep dive with alternatives
  STRATEGIC: 'strategic', // Executive-level with financials
};

// Brainstorm aspects
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

// Plan stages
export const PLAN_STAGES = {
  IDEA_ANALYSIS: 'idea_analysis',
  BRAINSTORMING: 'brainstorming',
  PLAN_GENERATION: 'plan_generation',
  REFINEMENT: 'refinement',
  COMPLETED: 'completed',
};

// Domains
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

// Conversation configuration
export const CONVERSATION_CATEGORY = 'plan_generation';
export const CONVERSATION_MODEL = 'gemini-2.0-flash-exp';

// Default parameters
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

// System prompts for different stages
export const SYSTEM_PROMPTS = {
  IDEA_ANALYSIS: `You are an expert business analyst and strategic planner. Your role is to:
1. Analyze the user's idea thoroughly to understand its scope, feasibility, and requirements
2. Identify the type of plan needed (business, project, product launch, etc.)
3. Assess the complexity level and required domains
4. Determine clarity score - how well-defined the idea is
5. Ask intelligent, strategic clarifying questions if the idea is vague
6. Extract key requirements, constraints, and goals

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

Format your output as a well-structured, professional plan document. Be specific and actionable.`,

  REFINEMENT: `You are a plan optimization expert. Your role is to:
1. Refine and improve existing plans based on user feedback
2. Adjust specific sections while maintaining overall coherence
3. Optimize for different constraints (budget, timeline, resources)
4. Provide alternative approaches when requested
5. Ensure all changes are practical and feasible

Maintain consistency with the original plan while incorporating improvements. Be responsive to user needs.`,

  CONVERSATIONAL: `You are an intelligent planning assistant helping users develop comprehensive plans for their ideas. You can:
1. Understand natural language descriptions of ideas
2. Ask clarifying questions to better understand requirements
3. Generate creative brainstorming insights
4. Create detailed, structured plans
5. Refine plans based on feedback
6. Explain specific sections or provide alternatives

Be conversational, helpful, and professional. Guide users through the planning process step by step.`,
};

// Response messages
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
};

// Plan sections
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

// Clarity score thresholds
export const CLARITY_THRESHOLDS = {
  VERY_CLEAR: 0.8, // Idea is well-defined, ready for planning
  CLEAR: 0.6, // Idea is understandable, minor clarifications needed
  MODERATE: 0.4, // Idea needs significant clarification
  UNCLEAR: 0.2, // Idea is too vague, major clarifications needed
};

// Export formats
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  JSON: 'json',
  MARKDOWN: 'markdown',
  HTML: 'html',
};

// Plan status
export const PLAN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

// Question templates for clarification
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
