// Brainstorm Configuration
export const BRAINSTORM_CONFIG = {
  MODEL: 'gemini-3.5-flash',
  TEMPERATURE: 0.8,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_IDEA_LENGTH: 5000,
  MIN_IDEA_LENGTH: 10,
};

// Brainstorm Types
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

// Brainstorming Techniques
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

// Analysis Perspectives
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

// Brainstorm Depth Levels
export const DEPTH_LEVELS = {
  QUICK: 'quick',
  STANDARD: 'standard',
  DEEP: 'deep',
  COMPREHENSIVE: 'comprehensive',
};

// Focus Areas
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

// Brainstorm Intents
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

// Conversation configuration
export const CONVERSATION_CATEGORY = 'brainstorm';
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

// Default Parameters
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

// System Prompts
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

  IDEA_GENERATOR: (
    type,
    depth,
    technique,
    perspectives
  ) => `Generate creative brainstorm ideas for a ${type} using ${technique} technique.

Analyze from these perspectives: ${perspectives.join(', ')}
Depth level: ${depth}

Structure your response with:
1. Main ideas (numbered and detailed)
2. Supporting variations
3. Key opportunities
4. Potential challenges
5. Next steps to explore

Be specific, actionable, and innovative.`,

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

// Response Messages
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

// Clarification Suggestions
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

// Technique Descriptions
export const TECHNIQUE_DESCRIPTIONS = {
  [TECHNIQUES.SCAMPER]: {
    name: 'SCAMPER',
    description:
      'Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse',
    useCase: 'Best for improving existing ideas or products',
  },
  [TECHNIQUES.MIND_MAP]: {
    name: 'Mind Mapping',
    description: 'Hierarchical exploration of related concepts',
    useCase: 'Best for visual thinkers and exploring connections',
  },
  [TECHNIQUES.SIX_THINKING_HATS]: {
    name: 'Six Thinking Hats',
    description:
      'Analyze from six different thinking modes (facts, emotions, caution, benefits, creativity, process)',
    useCase: 'Best for comprehensive analysis from multiple viewpoints',
  },
  [TECHNIQUES.SWOT_ANALYSIS]: {
    name: 'SWOT Analysis',
    description: 'Strengths, Weaknesses, Opportunities, Threats',
    useCase: 'Best for strategic planning and evaluation',
  },
  [TECHNIQUES.FIVE_WHYS]: {
    name: 'Five Whys',
    description: 'Dig deeper by asking "why" repeatedly to find root causes',
    useCase: 'Best for problem-solving and understanding core issues',
  },
  [TECHNIQUES.REVERSE_BRAINSTORM]: {
    name: 'Reverse Brainstorming',
    description: 'Think about how to cause the problem, then reverse it',
    useCase: 'Best for problem-solving and finding unconventional solutions',
  },
  [TECHNIQUES.BRAINWRITING]: {
    name: 'Brainwriting',
    description: 'Written idea generation with building on previous ideas',
    useCase: 'Best for structured, iterative idea development',
  },
  [TECHNIQUES.FREE_ASSOCIATION]: {
    name: 'Free Association',
    description: 'Generate ideas freely without constraints',
    useCase: 'Best for creative exploration and generating many options',
  },
  [TECHNIQUES.STARBURSTING]: {
    name: 'Starbursting',
    description: 'Ask who, what, where, when, why, and how questions',
    useCase: 'Best for thorough exploration of all aspects',
  },
  [TECHNIQUES.ROLE_STORMING]: {
    name: 'Role Storming',
    description: "Think from different personas or stakeholders' perspectives",
    useCase: 'Best for understanding different viewpoints',
  },
};

// Idea Complexity Levels
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  VERY_COMPLEX: 'very_complex',
};

// Output Formats
export const OUTPUT_FORMATS = {
  JSON: 'json',
  MARKDOWN: 'markdown',
  PDF: 'pdf',
  HTML: 'html',
};
