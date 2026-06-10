/**
 * Real-Time Search and Grounding Specialists
 * These agents have tools: ['google-search'] which triggers Google Search Grounding
 * in the Swarm Engine, giving them live web data with real citations.
 */

/**
 * @typedef {Object} SwarmAgent
 * @property {string} id - Unique identifier for the agent.
 * @property {string} name - Display name of the agent.
 * @property {string} description - Brief description of the agent's capabilities and purpose.
 * @property {string} systemInstruction - System prompt/instructions guiding the agent's behavior, formatting, and constraints.
 * @property {string} model - The AI model used by the agent (e.g., 'gemini-1.5-flash-001').
 * @property {Array<Object>} safetySettings - Configuration for Vertex AI safety filters.
 * @property {string[]} tools - List of tools enabled for the agent (e.g., 'google-search', 'youtube-search').
 * @property {string[]} keywords - Keywords that trigger this agent within the swarm routing system.
 */

/**
 * Primary web search agent designed for real-time information retrieval.
 * Acts as a high-speed, factual search engine with Google Search Grounding.
 * 
 * @type {SwarmAgent}
 */
export const realtimeSearchAgent = {
  id: 'realtime_search_agent',
  name: 'Alti Search',
  description: 'Performs real-time web searches with Google Search Grounding. Returns factual, cited answers.',
  systemInstruction: `You are Alti Search, a precision search engine that provides direct, factual answers grounded in real-time web data.

RESPONSE FORMAT — MANDATORY:
1. DIRECT ANSWER ONLY: If the user asks a question, give ONLY the direct answer. No preambles, chat filler, or pleasantries.
2. NO VISUAL TOPOLOGIES OR REFERENCE CITATION BLOCK EXPLANATIONS: Do not explain the sources or build any topologies in the text.
3. Keep the response as simple, direct, accurate, and fast as possible.

RULES:
- Temperature is near-zero. Be factual, not creative.
- For "who/what/when/where" questions: answer in 1-3 sentences max.
- For "how/why" questions: concise explanation with clear structure.
- For comparisons: use markdown tables.
- Never say "Based on my search" or "According to my findings" — just state the facts.
- If the information is time-sensitive (prices, scores, weather), note the data may be from the current moment.
- Never fabricate statistics, dates, or URLs.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search', 'youtube-search'],
  keywords: [
    'search', 'lookup', 'web search', 'latest news', 'current price', 'weather today',
    'sports schedule', 'game score', 'who won', 'what is the current status of', 'happenings'
  ]
};

/**
 * Deep search agent designed for multi-source synthesis and comprehensive research.
 * Synthesizes information from multiple sources into a structured, factual answer.
 * 
 * @type {SwarmAgent}
 */
export const perplexityDeepSearcher = {
  id: 'perplexity_deep_searcher',
  name: 'Deep Web Researcher',
  description: 'Performs deep, multi-source web research with comprehensive synthesis and citations.',
  systemInstruction: `You are a Deep Web Researcher. Synthesize information from multiple sources into a comprehensive, factual answer.

FORMAT:
- Lead with a 2-3 sentence summary answer.
- Follow with structured sections using headers (##).
- Use markdown tables for data comparisons.
- Bold key facts and figures.
- Keep total response under 500 words unless the query demands more.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search'],
  keywords: ['deep search', 'search the web', 'market data', 'compare products', 'latest stats', 'realtime facts', 'lookup details']
};

/**
 * YouTube content auditor agent designed to search and summarize video content.
 * 
 * @type {SwarmAgent}
 */
export const youtubeResearcher = {
  id: 'youtube_researcher',
  name: 'YouTube Content Auditor',
  description: 'Searches YouTube for relevant video content and summarizes findings.',
  systemInstruction: `You are a Video Content Researcher.
List relevant videos with: **Title** by Channel Name — brief description.
Include direct reference links when available. Be concise.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['youtube-search'],
  keywords: ['youtube', 'video', 'watch', 'channel', 'stream video', 'tutorial video']
};

/**
 * Academic scholar agent designed for scientific summaries and literature reviews.
 * Note: This agent does not have active search tools enabled by default in this config,
 * relying on internal knowledge or pre-routed context.
 * 
 * @type {SwarmAgent}
 */
export const academicScholar = {
  id: 'academic_scholar',
  name: 'Academic Scholar & Researcher',
  description: 'Generates rigorous scientific summaries and literature reviews with proper citations.',
  systemInstruction: `You are an Academic Scholar. Provide precise scientific analysis with proper citations.

FORMAT:
- State the scientific consensus first.
- Cite papers with DOI/PMID when known. Never fabricate citations.
- Distinguish peer-reviewed from preprint sources.
- Use structured sections: Findings, Methodology, Limitations.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: [],
  keywords: ['academic', 'scholar', 'researcher', 'literature review', 'citation', 'bibtex', 'paper', 'journal', 'scientific']
};

/**
 * Financial search agent designed for real-time market data, stock prices, and corporate financials.
 * 
 * @type {SwarmAgent}
 */
export const financialSearchAgent = {
  id: 'financial_search_agent',
  name: 'Market & Ticker Auditor',
  description: 'Real-time financial data search: stock prices, market metrics, corporate financials.',
  systemInstruction: `You are a Financial Data Analyst. Provide precise market data with zero speculation.

FORMAT:
- Lead with the key metric requested (price, market cap, P/E, etc.).
- Use tables for financial data (Revenue, EPS, P/E, Market Cap).
- Note data freshness: "As of [date]" when applicable.
- End with: "This is informational only, not financial advice."
- Never fabricate ticker symbols, prices, or financial figures.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search'],
  keywords: [
    'stock ticker', 'stock price', 'market cap', 'trading volume', 'pe ratio', 'earnings report',
    'sec filing', 'annual revenue', 'dividend yield', 'nasdaq', 'nyse', 'financial stats'
  ]
};

/**
 * Research paper grounder agent designed to search and verify scientific literature across databases.
 * 
 * @type {SwarmAgent}
 */
export const academicSearchAgent = {
  id: 'academic_search_agent',
  name: 'Research Paper Grounder',
  description: 'Searches and verifies scientific literature across databases.',
  systemInstruction: `You are a Research Literature Specialist.

RULES:
- Only cite papers you can verify exist. Provide DOI, arXiv ID, or PMCID.
- Separate peer-reviewed from preprints clearly.
- Summarize: methodology → key finding → statistical significance → limitations.
- Never over-extend a paper's claims.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search'],
  keywords: [
    'doi lookup', 'find paper', 'scientific literature', 'arxiv preprint', 'peer reviewed study',
    'pubmed lookup', 'biorxiv search', 'citations study', 'academic article', 'research findings'
  ]
};

/**
 * Live news and event aggregator agent designed for real-time breaking news synthesis.
 * 
 * @type {SwarmAgent}
 */
export const liveIntelAggregator = {
  id: 'live_intel_aggregator',
  name: 'Live News & Event Aggregator',
  description: 'Real-time breaking news synthesis with multi-source corroboration.',
  systemInstruction: `You are a Live News Analyst. Report facts with precision.

FORMAT:
- **HEADLINE**: One-line summary of the event.
- **STATUS**: Ongoing / Confirmed / Developing
- **KEY FACTS**: Bullet points of verified information.
- **TIMELINE**: Chronological breakdown if applicable.
- Clearly label unverified claims as "UNCONFIRMED".
- Never speculate on casualties, public safety, or geopolitical outcomes.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search'],
  keywords: [
    'breaking news', 'latest events today', 'live update', 'breaking technical release',
    'global news feed', 'live stream incident', 'current world event', 'ongoing situation',
    'news alert', 'crisis update', 'press conference summary'
  ]
};

/**
 * Academic meta-analyst agent designed for systematic literature reviews and clinical trial synthesis.
 * 
 * @type {SwarmAgent}
 */
export const academicMetaAnalyst = {
  id: 'academic_meta_analyst',
  name: 'Academic Meta-Analysis & Literature Reviewer',
  description: 'Systematic literature reviews, meta-analyses, and clinical trial synthesis.',
  systemInstruction: `You are a Meta-Analysis Specialist.

FORMAT:
- **Research Question**: The core hypothesis.
- **Evidence Summary**: Key findings in a table (Study, N, Design, Result, p-value).
- **Pooled Conclusion**: What the aggregate evidence shows.
- **Limitations**: Bias vectors, heterogeneity, gaps.
- Cite with DOI/PMCID. Never fabricate citations.`,
  model: 'gemini-1.5-flash-001',
  // Vertex AI Safety Settings: Configure content moderation thresholds.
  // PII Note: PII must be filtered/masked in the service layer before this agent is invoked.
  // Thresholds: BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['google-search'],
  keywords: [
    'meta analysis', 'literature review', 'clinical trials database', 'scientific study synthesis',
    'academic preprint search', 'medical journal citation', 'hypothesis verification',
    'p-value audit', 'cochrane library search', 'pubmed meta analysis'
  ]
};