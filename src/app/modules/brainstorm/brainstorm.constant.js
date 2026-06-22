/**
 * @fileoverview This file contains various constants used throughout the brainstorm module,
 * including configuration settings, predefined types, techniques, perspectives,
 * system prompts, and response messages.
 * These constants help standardize and manage the behavior and content generation
 * for the AI brainstorming assistant.
 */

/**
 * @typedef {object} BrainstormConfig
 * @property {string} MODEL - The AI model to use for brainstorming.
 * @property {number} TEMPERATURE - Controls the randomness of the output. Higher values mean more random.
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens to generate in the output.
 * @property {number} MAX_IDEA_LENGTH - The maximum length allowed for a single generated idea.
 * @property {number} MIN_IDEA_LENGTH - The minimum length required for a single generated idea.
 */

/**
 * Brainstorm Configuration settings for the AI model.
 * @type {BrainstormConfig}
 */
export const BRAINSTORM_CONFIG = {
  // Updated to a valid and current model name to prevent execution errors.
  MODEL: 'gemini-3.5-flash',
  TEMPERATURE: 0.8,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_IDEA_LENGTH: 5000,
  MIN_IDEA_LENGTH: 10,
};

/**
 * @typedef {object} BrainstormTypes
 * @property {string} PRODUCT_IDEA - Brainstorming for new product concepts.
 * @property {string} BUSINESS_STRATEGY - Brainstorming for business strategies.
 * @property {string} MARKETING_CAMPAIGN - Brainstorming for marketing campaign ideas.
 * @property {string} TECHNICAL_SOLUTION - Brainstorming for technical solutions to problems.
 * @property {string} CREATIVE_CONTENT - Brainstorming for creative content ideas (e.g., stories, art).
 * @property {string} PROBLEM_SOLVING - Brainstorming for solutions to general problems.
 * @property {string} PROCESS_IMPROVEMENT - Brainstorming for ways to improve existing processes.
 * @property {string} GENERAL - General brainstorming without a specific type.
 */

/**
 * Defines various types of brainstorming sessions.
 * @type {BrainstormTypes}
 */
export const BRAINSTORM_TYPES = {
  PRODUCT_IDEA: 'product_idea',
  BUSINESS_STRATEGY: 'business_strategy',
  MARKETING_CAMPAIGN: 'marketing_campaign',
  TECHNICAL_SOLUTION: 'technical_solution',
  CREATIVE_CONTENT: 'creative_content',
  PROBLEM_SOLVING: 'problem_solving',
  PROCESS_IMPROVEMENT: 'process_improvement',
  GENERAL: 'general',
};

/**
 * @typedef {object} BrainstormingTechniques
 * @property {string} SCAMPER - Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse.
 * @property {string} MIND_MAP - Hierarchical exploration of related concepts.
 * @property {string} SIX_THINKING_HATS - Analyze from six different thinking modes.
 * @property {string} SWOT_ANALYSIS - Strengths, Weaknesses, Opportunities, Threats.
 * @property {string} FIVE_WHYS - Repeatedly asking "why" to find root causes.
 * @property {string} REVERSE_BRAINSTORM - Think about how to cause the problem, then reverse it.
 * @property {string} BRAINWRITING - Written idea generation with building on previous ideas.
 * @property {string} FREE_ASSOCIATION - Generate ideas freely without constraints.
 * @property {string} STARBURSTING - Ask who, what, where, when, why, and how questions.
 * @property {string} ROLE_STORMING - Think from different personas or stakeholders' perspectives.
 */

/**
 * Defines various brainstorming techniques that can be applied.
 * @type {BrainstormingTechniques}
 */
export const TECHNIQUES = {
  SCAMPER: 'scamper',
  MIND_MAP: 'mind_map',
  SIX_THINKING_HATS: 'six_thinking_hats',
  SWOT_ANALYSIS: 'swot',
  FIVE_WHYS: 'five_whys',
  REVERSE_BRAINSTORM: 'reverse_brainstorm',
  BRAINWRITING: 'brainwriting',
  FREE_ASSOCIATION: 'free_association',
  STARBURSTING: 'starbursting',
  ROLE_STORMING: 'role_storming',
};

/**
 * @typedef {object} AnalysisPerspectives
 * @property {string} BUSINESS - Analyze from a business viability and strategy standpoint.
 * @property {string} TECHNICAL - Analyze from a technical feasibility and implementation standpoint.
 * @property {string} CREATIVE - Analyze from an innovation and originality standpoint.
 * @property {string} USER_CENTRIC - Analyze from the perspective of the end-user's needs and experience.
 * @property {string} STRATEGIC - Analyze from a long-term planning and competitive advantage standpoint.
 * @property {string} OPERATIONAL - Analyze from an execution and process efficiency standpoint.
 * @property {string} FINANCIAL - Analyze from a cost, revenue, and profitability standpoint.
 * @property {string} COMPETITIVE - Analyze in relation to market competitors and differentiation.
 */

/**
 * Defines different perspectives from which an idea can be analyzed.
 * @type {AnalysisPerspectives}
 */
export const PERSPECTIVES = {
  BUSINESS: 'business',
  TECHNICAL: 'technical',
  CREATIVE: 'creative',
  USER_CENTRIC: 'user_centric',
  STRATEGIC: 'strategic',
  OPERATIONAL: 'operational',
  FINANCIAL: 'financial',
  COMPETITIVE: 'competitive',
};

/**
 * @typedef {object} BrainstormDepthLevels
 * @property {string} QUICK - A quick, high-level brainstorm with fewer ideas.
 * @property {string} STANDARD - A balanced brainstorm with a moderate number of ideas and detail.
 * @property {string} DEEP - A detailed brainstorm with more ideas and in-depth analysis.
 * @property {string} COMPREHENSIVE - An exhaustive brainstorm with a large number of ideas and extensive detail.
 */

/**
 * Defines the depth levels for a brainstorming session, influencing the number and detail of ideas generated.
 * @type {BrainstormDepthLevels}
 */
export const DEPTH_LEVELS = {
  QUICK: 'quick',
  STANDARD: 'standard',
  DEEP: 'deep',
  COMPREHENSIVE: 'comprehensive',
};

/**
 * @typedef {object} FocusAreas
 * @property {string} INNOVATION - Focus on novel and creative aspects.
 * @property {string} FEASIBILITY - Focus on practical implementation and viability.
 * @property {string} MARKETABILITY - Focus on market appeal, demand, and potential.
 * @property {string} SCALABILITY - Focus on the ability to grow and expand.
 * @property {string} UNIQUENESS - Focus on differentiation and distinctiveness.
 * @property {string} PROFITABILITY - Focus on financial returns and revenue generation.
 * @property {string} USER_VALUE - Focus on benefits and value for the end-user.
 * @property {string} SUSTAINABILITY - Focus on long-term viability and environmental/social impact.
 */

/**
 * Defines specific areas to focus on during a brainstorming session.
 * @type {FocusAreas}
 */
export const FOCUS_AREAS = {
  INNOVATION: 'innovation',
  FEASIBILITY: 'feasibility',
  MARKETABILITY: 'marketability',
  SCALABILITY: 'scalability',
  UNIQUENESS: 'uniqueness',
  PROFITABILITY: 'profitability',
  USER_VALUE: 'user_value',
  SUSTAINABILITY: 'sustainability',
};

/**
 * @typedef {object} BrainstormIntents
 * @property {string} GENERATE_IDEAS - User wants to generate new ideas.
 * @property {string} EXPAND_IDEA - User wants to expand on an existing idea.
 * @property {string} ANALYZE_IDEA - User wants to analyze an existing idea.
 * @property {string} REFINE_IDEA - User wants to refine or improve an existing idea.
 * @property {string} EVALUATE_IDEA - User wants to evaluate an idea's potential.
 * @property {string} COMPARE_IDEAS - User wants to compare multiple ideas.
 * @property {string} IDENTIFY_RISKS - User wants to identify potential risks.
 * @property {string} FIND_OPPORTUNITIES - User wants to find new opportunities.
 * @property {string} CLARIFICATION - User's intent requires more information.
 * @property {string} UNKNOWN - User's intent could not be determined.
 */

/**
 * Defines the possible intents a user might have when interacting with the brainstorming assistant.
 * @type {BrainstormIntents}
 */
export const BRAINSTORM_INTENTS = {
  GENERATE_IDEAS: 'generate_ideas',
  EXPAND_IDEA: 'expand_idea',
  ANALYZE_IDEA: 'analyze_idea',
  REFINE_IDEA: 'refine_idea',
  EVALUATE_IDEA: 'evaluate_idea',
  COMPARE_IDEAS: 'compare_ideas',
  IDENTIFY_RISKS: 'identify_risks',
  FIND_OPPORTUNITIES: 'find_opportunities',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

/**
 * The category identifier for brainstorming conversations.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'brainstorm';

/**
 * The AI model to be used for general conversation within the brainstorming module.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

/**
 * @typedef {object} DefaultParameters
 * @property {string} brainstormType - The default type of brainstorming.
 * @property {string} depth - The default depth level for brainstorming.
 * @property {string} technique - The default brainstorming technique.
 * @property {string[]} perspectives - The default perspectives for analysis.
 * @property {object} ideaCount - A map defining the number of ideas to generate per depth level.
 * @property {number} ideaCount.quick - Number of ideas for 'quick' depth.
 * @property {number} ideaCount.standard - Number of ideas for 'standard' depth.
 * @property {number} ideaCount.deep - Number of ideas for 'deep' depth.
 * @property {number} ideaCount.comprehensive - Number of ideas for 'comprehensive' depth.
 */

/**
 * Default parameters for a brainstorming session when not explicitly specified by the user.
 * @type {DefaultParameters}
 */
export const DEFAULT_PARAMS = {
  brainstormType: BRAINSTORM_TYPES.GENERAL,
  depth: DEPTH_LEVELS.STANDARD,
  technique: TECHNIQUES.FREE_ASSOCIATION,
  perspectives: [PERSPECTIVES.BUSINESS, PERSPECTIVES.USER_CENTRIC],
  ideaCount: {
    [DEPTH_LEVELS.QUICK]: 10,
    [DEPTH_LEVELS.STANDARD]: 20,
    [DEPTH_LEVELS.DEEP]: 35,
    [DEPTH_LEVELS.COMPREHENSIVE]: 50,
  },
};

/**
 * @typedef {object} SystemPrompts
 * @property {string} MAIN_ASSISTANT - The core system prompt defining the AI's role and capabilities as a brainstorming assistant.
 * @property {string} INTENT_ANALYZER - System prompt for analyzing user intent in brainstorming requests.
 * @property {function(string, string, string, string[], number, string[], string): string} IDEA_GENERATOR - A function that generates a system prompt for idea generation based on specified parameters.
 * @property {string} IDEA_ANALYZER - System prompt for comprehensively analyzing a given idea.
 * @property {string} IDEA_REFINER - System prompt for refining and improving an existing idea.
 */

/**
 * Collection of system prompts used to guide the AI's behavior and response generation
 * for different brainstorming tasks.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  MAIN_ASSISTANT: `You are an expert creative brainstorming assistant. Your role is to help users explore, develop, and refine ideas through structured and creative thinking.

Your capabilities:
- Generate diverse, innovative ideas
- Apply various brainstorming techniques (SCAMPER, Mind Mapping, SWOT, etc.)
- Analyze ideas from multiple perspectives (business, technical, user-centric, etc.)
- Identify opportunities and risks
- Provide constructive feedback and refinement suggestions
- Ask clarifying questions when needed

Guidelines:
- Be creative yet practical
- Generate specific, actionable ideas
- Provide reasoning for suggestions
- Consider feasibility and impact
- Encourage iteration and exploration
- Structure responses clearly`,

  INTENT_ANALYZER: `You are an intent analyzer for a brainstorming assistant. Analyze the user's message to understand:
1. What they want to do (generate, expand, analyze, refine, etc.)
2. What type of brainstorming they need
3. Any specific parameters mentioned
4. Whether you need more information

Be conversational and helpful. If intent is unclear, ask clarifying questions.`,

  /**
   * Generates a system prompt for the AI to create brainstorm ideas.
   * This prompt is highly structured to ensure consistent and high-quality output.
   * @param {string} type - The type of brainstorming (e.g., 'product_idea').
   * @param {string} depth - The depth level of the brainstorm (e.g., 'standard').
   * @param {string} technique - The brainstorming technique to use (e.g., 'free_association').
   * @param {string[]} perspectives - An array of perspectives to analyze from (e.g., ['business', 'user_centric']).
   * @param {number} ideaCount - The specific number of ideas to generate.
   * @param {string[]} [focusAreas=[]] - Optional array of specific areas to focus on.
   * @param {string} [constraints=''] - Optional string describing any user-provided constraints.
   * @returns {string} The formatted system prompt for idea generation.
   */
  IDEA_GENERATOR: (
    type,
    depth,
    technique,
    perspectives,
    ideaCount,
    focusAreas = [],
    constraints = ''
  ) => {
    // Dynamically include technique description for better AI context.
    const techniqueInfo = TECHNIQUE_DESCRIPTIONS[technique] || {
      name: technique,
      description: 'A standard brainstorming method.',
    };
    const focusAreaText =
      focusAreas.length > 0
        ? `\n- **Primary Focus Areas:** ${focusAreas.join(', ')}.`
        : '';
    const constraintsText = constraints
      ? `\n- **User-defined Constraints:** ${constraints}.`
      : '';

    // The prompt is optimized for clarity, structure, and to provide the AI with all necessary context.
    return `You are an expert brainstorming assistant. Your task is to generate creative and actionable ideas.

**Brainstorming Goal:** Generate ideas for a new "${type}".

**Core Parameters:**
- **Technique to Apply:** ${techniqueInfo.name}.
  - **Description:** ${techniqueInfo.description}.
- **Number of Ideas to Generate:** Approximately ${ideaCount} ideas.
- **Depth Level:** ${depth}. This means the ideas should have a corresponding level of detail and exploration.
- **Analysis Perspectives:** ${perspectives.join(', ')}.
${focusAreaText}
${constraintsText}

**Output Requirements:**
- **Format:** Use clear Markdown formatting. Use headings (e.g., ##) for each major section.
- **Idea Structure:** Each idea must be detailed, actionable, and between ${
      BRAINSTORM_CONFIG.MIN_IDEA_LENGTH
    } and ${BRAINSTORM_CONFIG.MAX_IDEA_LENGTH} characters long.
- **Content Structure:** For your entire response, follow this structure precisely:
  1.  **Main Ideas:** A numbered list of the ${ideaCount} core ideas. For each idea, provide a title and a detailed description.
  2.  **Key Opportunities:** A summary of the most promising opportunities discovered.
  3.  **Potential Challenges:** A list of potential risks or challenges to consider.
  4.  **Next Steps:** A few actionable next steps the user could take to explore these ideas further.

Begin generating the ideas now.`;
  },

  IDEA_ANALYZER: `Analyze the provided idea comprehensively. Evaluate:
- Uniqueness and innovation
- Feasibility and complexity
- Market potential
- Technical requirements
- User value proposition
- Risks and challenges
- Opportunities for improvement

Provide structured, detailed analysis.`,

  IDEA_REFINER: `Help refine and improve the provided idea. Consider:
- Strengthening weak points
- Addressing identified risks
- Enhancing unique value
- Improving feasibility
- Adding missing elements
- Optimizing for target goals

Provide specific, actionable refinement suggestions.`,
};

/**
 * @typedef {object} ResponseMessages
 * @property {string} WELCOME - Initial welcome message to the user.
 * @property {string} NEED_IDEA - Message prompting the user to provide an idea.
 * @property {string} NEED_MORE_INFO - Message indicating that more context is needed.
 * @property {string} IDEA_RECEIVED - Confirmation message that an idea has been received.
 * @property {string} REFINING - Message indicating that the AI is refining an idea.
 * @property {string} ANALYZING - Message indicating that the AI is analyzing an idea.
 * @property {string} ERROR_PROCESSING - Generic error message for processing failures.
 */

/**
 * Standardized response messages used by the brainstorming assistant.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  WELCOME:
    "Hello! I'm your brainstorming assistant. Share your idea, and I'll help you explore it from multiple angles.",
  NEED_IDEA: "Please share the idea or topic you'd like to brainstorm about.",
  NEED_MORE_INFO:
    '🤔 Great start! I can help you brainstorm better with a bit more context.',
  IDEA_RECEIVED:
    'Great idea! Let me generate some brainstorm concepts for you.',
  REFINING: 'Let me refine and expand on that idea.',
  ANALYZING: "I'll analyze your idea from multiple perspectives.",
  ERROR_PROCESSING:
    'I encountered an issue while processing your request. Please try again.',
};

/**
 * @typedef {object} ClarificationSuggestion
 * @property {string} question - The question to ask the user for clarification.
 * @property {string[]} suggestions - An array of suggested options or examples.
 * @property {string} example - An example of how the user can respond.
 */

/**
 * @typedef {object} ClarificationSuggestions
 * @property {ClarificationSuggestion} technique - Suggestions for choosing a brainstorming technique.
 * @property {ClarificationSuggestion} depth - Suggestions for choosing a brainstorming depth level.
 * @property {ClarificationSuggestion} focusAreas - Suggestions for choosing focus areas.
 * @property {ClarificationSuggestion} constraints - Suggestions for providing constraints.
 */

/**
 * Predefined suggestions and questions to guide the user when more information is needed
 * for a brainstorming session.
 * @type {ClarificationSuggestions}
 */
export const CLARIFICATION_SUGGESTIONS = {
  technique: {
    question: 'Which brainstorming technique would you prefer?',
    suggestions: [
      '💡 **Free Association** - Quick, creative idea generation (default)',
      '🔄 **SCAMPER** - Improve existing concepts',
      '📊 **SWOT** - Strategic analysis',
      '🧠 **Mind Map** - Explore connections',
    ],
    example: 'Or just say "use SWOT" or let me choose for you!',
  },
  depth: {
    question: 'How deep should we go?',
    suggestions: [
      '⚡ **Quick** - Fast overview (~10 ideas, 5-10 min)',
      '✨ **Standard** - Balanced approach (~20 ideas, 10-15 min) - Recommended',
      '🔍 **Deep** - Detailed analysis (~35 ideas, 15-25 min)',
      '🚀 **Comprehensive** - Exhaustive exploration (50+ ideas)',
    ],
    example:
      'Just say "quick brainstorm" or "deep dive" - or I\'ll use Standard mode!',
  },
  focusAreas: {
    question: 'What should we focus on?',
    suggestions: [
      '💡 **Innovation** - Novel, creative approaches',
      '💰 **Profitability** - Revenue and monetization',
      '📈 **Marketability** - Market appeal and demand',
      '🎯 **Feasibility** - Practical implementation',
    ],
    example:
      'e.g., "Focus on innovation and profitability" or let me cover all angles!',
  },
  constraints: {
    question: 'Any constraints I should know about?',
    suggestions: [
      '💵 Budget (e.g., "$10k budget")',
      '⏰ Timeline (e.g., "3 months to MVP")',
      '🎯 Target audience (e.g., "millennials, ages 25-35")',
      '🛠️ Technology stack (e.g., "React Native, Python")',
    ],
    example:
      'e.g., "Budget is $15k, timeline 6 months" or skip if no constraints!',
  },
};

/**
 * @typedef {object} TechniqueDetail
 * @property {string} name - The full name of the technique.
 * @property {string} description - A brief description of the technique.
 * @property {string} useCase - When the technique is best applied.
 */

/**
 * @typedef {object} TechniqueDescriptions
 * @property {TechniqueDetail} SCAMPER - Details for the SCAMPER technique.
 * @property {TechniqueDetail} MIND_MAP - Details for the Mind Mapping technique.
 * @property {TechniqueDetail} SIX_THINKING_HATS - Details for the Six Thinking Hats technique.
 * @property {TechniqueDetail} SWOT_ANALYSIS - Details for the SWOT Analysis technique.
 * @property {TechniqueDetail} FIVE_WHYS - Details for the Five Whys technique.
 * @property {TechniqueDetail} REVERSE_BRAINSTORM - Details for the Reverse Brainstorming technique.
 * @property {TechniqueDetail} BRAINWRITING - Details for the Brainwriting technique.
 * @property {TechniqueDetail} FREE_ASSOCIATION - Details for the Free Association technique.
 * @property {TechniqueDetail} STARBURSTING - Details for the Starbursting technique.
 * @property {TechniqueDetail} ROLE_STORMING - Details for the Role Storming technique.
 */

/**
 * Provides detailed descriptions and use cases for each brainstorming technique.
 * @type {TechniqueDescriptions}
 */
export const TECHNIQUE_DESCRIPTIONS = {
  [TECHNIQUES.SCAMPER]: {
    name: 'SCAMPER',
    description:
      'A method using a set of seven directed questions (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, and Reverse) to find new ideas.',
    useCase: 'Best for improving existing ideas or products.',
  },
  [TECHNIQUES.MIND_MAP]: {
    name: 'Mind Mapping',
    description:
      'A visual thinking tool that helps structure information, helping you to better analyze, comprehend, synthesize, recall, and generate new ideas.',
    useCase: 'Best for visual thinkers and exploring connections between concepts.',
  },
  [TECHNIQUES.SIX_THINKING_HATS]: {
    name: 'Six Thinking Hats',
    description:
      'A method for group discussion and individual thinking involving six colored hats that represent different thinking modes (facts, emotions, caution, benefits, creativity, process).',
    useCase: 'Best for comprehensive analysis from multiple viewpoints.',
  },
  [TECHNIQUES.SWOT_ANALYSIS]: {
    name: 'SWOT Analysis',
    description:
      'A strategic planning technique used to identify and analyze the Strengths, Weaknesses, Opportunities, and Threats related to a project or business venture.',
    useCase: 'Best for strategic planning and competitive evaluation.',
  },
  [TECHNIQUES.FIVE_WHYS]: {
    name: 'Five Whys',
    description:
      'An iterative interrogative technique used to explore the cause-and-effect relationships underlying a particular problem by repeatedly asking "Why?".',
    useCase: 'Best for problem-solving and understanding core issues.',
  },
  [TECHNIQUES.REVERSE_BRAINSTORM]: {
    name: 'Reverse Brainstorming',
    description:
      'A technique that focuses on identifying potential problems or failures first, and then brainstorming solutions to prevent them.',
    useCase: 'Best for proactive problem-solving and finding unconventional solutions.',
  },
  [TECHNIQUES.BRAINWRITING]: {
    name: 'Brainwriting',
    description:
      'A non-verbal brainstorming technique where participants write down their ideas and then pass them on to others to build upon.',
    useCase: 'Best for structured, iterative idea development and inclusive participation.',
  },
  [TECHNIQUES.FREE_ASSOCIATION]: {
    name: 'Free Association',
    description:
      'A spontaneous and non-linear method of generating ideas where one thought leads to another without any constraints or judgment.',
    useCase: 'Best for creative exploration and generating a large quantity of diverse options.',
  },
  [TECHNIQUES.STARBURSTING]: {
    name: 'Starbursting',
    description:
      'A brainstorming technique that focuses on generating questions rather than answers, using a six-pointed star to explore who, what, where, when, why, and how.',
    useCase: 'Best for thorough exploration of a topic before generating ideas.',
  },
  [TECHNIQUES.ROLE_STORMING]: {
    name: 'Role Storming',
    description:
      "A technique where participants assume the identity of another person (e.g., a customer, a competitor) to generate ideas from a different perspective.",
    useCase: 'Best for understanding different viewpoints and user-centric design.',
  },
};

/**
 * @typedef {object} ComplexityLevels
 * @property {string} SIMPLE - An idea with low complexity, easy to implement.
 * @property {string} MODERATE - An idea with moderate complexity, requiring some effort.
 * @property {string} COMPLEX - An idea with high complexity, requiring significant resources.
 * @property {string} VERY_COMPLEX - An idea with very high complexity, potentially requiring extensive resources and time.
 */

/**
 * Defines different levels of complexity for ideas or solutions.
 * @type {ComplexityLevels}
 */
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  VERY_COMPLEX: 'very_complex',
};

/**
 * @typedef {object} OutputFormats
 * @property {string} JSON - Output in JSON format.
 * @property {string} MARKDOWN - Output in Markdown format.
 * @property {string} PDF - Output in PDF format.
 * @property {string} HTML - Output in HTML format.
 */

/**
 * Defines various output formats for generated brainstorming results.
 * @type {OutputFormats}
 */
export const OUTPUT_FORMATS = {
  JSON: 'json',
  MARKDOWN: 'markdown',
  PDF: 'pdf',
  HTML: 'html',
};