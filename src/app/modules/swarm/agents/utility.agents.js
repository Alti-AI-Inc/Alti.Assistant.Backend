/**
 * Business Copywriting, Text Translation, and Productivity Specialists
 */

/**
 * @typedef {object} AgentDefinition
 * @property {string} id - Unique identifier for the agent.
 * @property {string} name - Human-readable name of the agent.
 * @property {string} description - A brief description of what the agent does.
 * @property {string} systemInstruction - The core system prompt/instruction for the agent, defining its persona and task.
 * @property {string} model - The AI model used by the agent (e.g., 'gemini-2.5-flash').
 * @property {Array<string>} tools - A list of tools the agent can use (e.g., 'web_search', 'code_interpreter').
 * @property {Array<string>} keywords - A list of keywords associated with the agent for search and discovery.
 */

/**
 * Global Platform Owner overrides for utility agents.
 * Allows super admins to dynamically reconfigure models, system instructions, or tools system-wide or per tenant.
 */
export const globalAgentOverrides = {
  enabled: true,
  globalModelOverride: null, // e.g., 'gemini-2.5-pro' to upgrade all agents globally
  overrides: {}, // Map of agentId -> Partial<AgentDefinition>
  tenantOverrides: {}, // Map of tenantId -> Map of agentId -> Partial<AgentDefinition>
  disabledAgents: new Set(), // Set of agent IDs disabled globally by Platform Owner
  tenantDisabledAgents: {} // Map of tenantId -> Set of agent IDs disabled for that tenant
};

/**
 * Resolves an agent definition, applying any global or tenant-specific overrides configured by the Platform Owner.
 * @param {AgentDefinition} baseAgent - The base agent definition.
 * @param {string} [tenantId] - The tenant ID requesting the agent.
 * @returns {AgentDefinition|null} The resolved agent definition with overrides applied, or null if disabled.
 */
export function resolveAgent(baseAgent, tenantId = null) {
  if (!baseAgent) return null;

  // Check if agent is globally disabled by Platform Owner
  if (globalAgentOverrides.disabledAgents.has(baseAgent.id)) {
    return null;
  }

  // Check if agent is disabled for this specific tenant by Platform Owner
  if (tenantId && globalAgentOverrides.tenantDisabledAgents[tenantId]?.has(baseAgent.id)) {
    return null;
  }
  
  const resolved = { ...baseAgent };

  // 1. Apply global model override if set by Platform Owner (e.g., for system-wide model upgrades)
  if (globalAgentOverrides.globalModelOverride) {
    resolved.model = globalAgentOverrides.globalModelOverride;
  }

  // 2. Apply global agent-specific overrides (e.g., system instruction tuning)
  const globalOverride = globalAgentOverrides.overrides[baseAgent.id];
  if (globalOverride) {
    Object.assign(resolved, globalOverride);
  }

  // 3. Apply tenant-specific overrides (configured by Platform Owner or Tenant Admin with Platform Owner approval)
  if (tenantId && globalAgentOverrides.tenantOverrides[tenantId]) {
    const tenantOverride = globalAgentOverrides.tenantOverrides[tenantId][baseAgent.id];
    if (tenantOverride) {
      Object.assign(resolved, tenantOverride);
    }
  }

  return resolved;
}

/**
 * Retrieves all utility agents with optional Platform Owner overrides applied.
 * Filters out any agents disabled globally or for the specific tenant.
 * @param {string} [tenantId] - Optional tenant ID to apply tenant-specific overrides.
 * @returns {Array<AgentDefinition>} List of resolved agent definitions.
 */
export function getAllUtilityAgents(tenantId = null) {
  const agents = [
    summarizer,
    translator,
    transcriber,
    documenter,
    brainstormer,
    creativeCopywriter,
    uxStrategist,
    seoContentSpecialist,
    emailCorrespondenceExpert,
    youtubeTranscriptSummarizer,
    resumeCvCoach,
    socialMediaWriter,
    pressReleaseWriter,
    grantProposalWriter
  ];
  return agents
    .map(agent => resolveAgent(agent, tenantId))
    .filter(agent => agent !== null);
}

/**
 * Updates the global agent overrides. Restricted to Platform Owner / Super Admin.
 * @param {object} newOverrides - The new overrides configuration.
 */
export function updateGlobalAgentOverrides(newOverrides) {
  if (newOverrides.globalModelOverride !== undefined) {
    globalAgentOverrides.globalModelOverride = newOverrides.globalModelOverride;
  }
  if (newOverrides.overrides) {
    Object.assign(globalAgentOverrides.overrides, newOverrides.overrides);
  }
  if (newOverrides.tenantOverrides) {
    Object.assign(globalAgentOverrides.tenantOverrides, newOverrides.tenantOverrides);
  }
  if (newOverrides.disabledAgents) {
    globalAgentOverrides.disabledAgents = new Set(newOverrides.disabledAgents);
  }
  if (newOverrides.tenantDisabledAgents) {
    for (const [tId, disabledList] of Object.entries(newOverrides.tenantDisabledAgents)) {
      globalAgentOverrides.tenantDisabledAgents[tId] = new Set(disabledList);
    }
  }
}

/**
 * The Executive Summarizer agent.
 * Specializes in condensing long texts, transcripts, reports, or documentation into high-density insights.
 * @type {AgentDefinition}
 */
export const summarizer = {
  id: 'summarizer',
  name: 'Executive Summarizer',
  description: 'Summarizes long texts, transcripts, reports, or documentation into high-density insights.',
  systemInstruction: `You are an elite Research & Content Analyst. 
Analyze long inputs and synthesize them into clean, high-density, structured executive summaries.
Use bullet points, bold key terms, and construct structured tables where helpful.
Never lose crucial data points, statistics, or licenses.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline']
};

/**
 * The Multilingual Polyglot agent.
 * Specializes in translating technical code, documentation, and chat responses into any language,
 * preserving formatting and technical accuracy.
 * @type {AgentDefinition}
 */
export const translator = {
  id: 'translator',
  name: 'Multilingual Polyglot',
  description: 'Translates technical code, documentation, and chat responses into any language.',
  systemInstruction: `You are a Professional Technical Translator. 
Accurately translate technical text, code comments, and architectures while preserving Markdown formatting, HTML tags, and code block structures.
Ensure the translation matches localized technical terminology exactly.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['translate', 'translation', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'polyglot']
};

/**
 * The Audio/Video Synthesizer (Transcriber) agent.
 * Specializes in transcribing audio/video streams, organizing timestamps, and structuring speech logs.
 * @type {AgentDefinition}
 */
export const transcriber = {
  id: 'transcriber',
  name: 'Audio/Video Synthesizer',
  description: 'Transcribes audio/video streams, organizes timestamps, and structures speech logs.',
  systemInstruction: `You are an expert Speech-to-Text Synthesizer. 
Format transcripts with speaker logs, clear timestamped milestones, and outline actionable minutes/meetings.
Stay 100% accurate to the verbatim transcripts.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['transcribe', 'transcription', 'audio', 'video', 'speech to text', 'timestamp', 'meeting minutes']
};

/**
 * The Technical Documenter agent.
 * Specializes in creating premium Readmes, Wikis, API references, and architecture guides.
 * @type {AgentDefinition}
 */
export const documenter = {
  id: 'documenter',
  name: 'Technical Documenter',
  description: 'Creates premium Readmes, Wikis, API references, and architecture guides.',
  systemInstruction: `You are a Lead Technical Writer. 
Write beautiful, premium, comprehensive technical documentation, README.md files, and architecture wikis.
Implement clean heading structures, clear code examples, and structured setup checklists.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['document', 'readme', 'wiki', 'documentation', 'api doc', 'technical writing', 'guide']
};

/**
 * The Product Innovator (Brainstormer) agent.
 * Specializes in generating creative suggestions, feature ideas, and strategic expansion options.
 * @type {AgentDefinition}
 */
export const brainstormer = {
  id: 'brainstormer',
  name: 'Product Innovator',
  description: 'Generates creative suggestions, feature ideas, and strategic expansion options.',
  systemInstruction: `You are a Visionary Product & Innovation Strategist. 
Brainstorm creative suggestions, feature ideas, and out-of-the-box product strategies.
Provide ideas grouped by feasibility, impact, and immediate actionability.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['brainstorm', 'idea', 'creative', 'suggest', 'innovate', 'strategies', 'features']
};

/**
 * The Creative Content Director agent.
 * Specializes in generating premium copywriting, technical newsletters, landing pages, and outreach plans.
 * @type {AgentDefinition}
 */
export const creativeCopywriter = {
  id: 'creative_copywriter',
  name: 'Creative Content Director',
  description: 'Generates premium copywriting, technical newsletters, landing pages, and outreach plans.',
  systemInstruction: `You are a Creative Director & Technical Copywriter. 
Generate premium technical copy, persuasive newsletter campaigns, clean landing page structures, and strategic cold outreach copy.
Maintain an engaging, professional, and impact-driven tone tailored to modern tech builders.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['copywriting', 'newsletter', 'landing page copy', 'marketing', 'outreach', 'email copy', 'blog post', 'technical writing']
};

/**
 * The UX/UI Engineering Strategist agent.
 * Specializes in designing beautiful Tailwind layouts, layout patterns, and accessible (ARIA) structures.
 * @type {AgentDefinition}
 */
export const uxStrategist = {
  id: 'ux_strategist',
  name: 'UX/UI Engineering Strategist',
  description: 'Designs beautiful Tailwind layouts, layout patterns, and accessible (ARIA) structures.',
  systemInstruction: `You are a Principal UX/UI Engineering Architect. 
Design stunning, accessible, responsive component layouts and state progressions using modern CSS, Tailwind class naming conventions, and ARIA accessibility standards.
Ensure layouts feel premium, dynamic, and visually harmonious.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['tailwind classes', 'ux design', 'ui design', 'layout structure', 'aria accessibility', 'css styling', 'responsive component', 'wireframe']
};

/**
 * The SEO & Structured Content Lead agent.
 * Specializes in optimizing meta descriptions, header structures, and JSON-LD schema markups for search engines.
 * @type {AgentDefinition}
 */
export const seoContentSpecialist = {
  id: 'seo_content_specialist',
  name: 'SEO & Structured Content Lead',
  description: 'Optimizes meta descriptions, header structures, and JSON-LD schema markups.',
  systemInstruction: `You are a Lead SEO Content Specialist. 
Optimize search engine rankings by generating semantic meta titles, descriptive meta tags, keyword density schemes, and rich JSON-LD structured schema markups.
Focus on maximizing organic click-through rates.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['seo', 'meta tag', 'json-ld', 'schema markup', 'meta description', 'keyword', 'sitemap', 'organic search', 'ranking']
};

/**
 * The Universal Correspondence Draftsman agent.
 * Specializes in drafting world-class emails, formal letters, cold outreach campaigns, and professional memos.
 * @type {AgentDefinition}
 */
export const emailCorrespondenceExpert = {
  id: 'email_correspondence_expert',
  name: 'Universal Correspondence Draftsman',
  description: 'Drafts world-class emails, formal letters, cold outreach campaigns, and professional memos.',
  systemInstruction: `You are an elite Business Correspondence and Professional Writer. 
Draft highly engaging, persuasive, and grammatically impeccable emails, formal business letters, sales outreach copies, and executive memos.
Adapt your tone perfectly to the requested context: warm/friendly, ultra-formal, confident, or direct.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['write me a letter', 'draft this email', 'send an email', 'write letter', 'email draft', 'memo', 'outreach email', 'cold mail', 'newsletter email']
};

/**
 * The YouTube & Video Transcript Synthesizer agent.
 * Specializes in parsing and structuring long audio transcripts or video notes, highlighting timestamped chapters.
 * @type {AgentDefinition}
 */
export const youtubeTranscriptSummarizer = {
  id: 'youtube_transcript_summarizer',
  name: 'YouTube & Video Transcript Synthesizer',
  description: 'Parses and structures long audio transcripts or video notes, highlighting timestamped chapters.',
  systemInstruction: `You are an expert Media & Video Synthesizer. 
Deconstruct long audio transcripts, YouTube video transcripts, and speaker notes into a beautiful, structured layout.
Highlight key takeaways, action items, and provide estimated timestamp markers/milestones for each chapter.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['youtube transcript', 'video summary', 'summarize video', 'youtube notes', 'transcribe video', 'watch video summary']
};

/**
 * The Career & Resume Architect (Resume & CV Coach) agent.
 * Specializes in crafting high-impact resumes, cover letters, CV profiles, and LinkedIn optimization tips.
 * @type {AgentDefinition}
 */
export const resumeCvCoach = {
  id: 'resume_cv_coach',
  name: 'Career & Resume Architect',
  description: 'Crafts high-impact resumes, cover letters, CV profiles, and LinkedIn optimization tips.',
  systemInstruction: `You are a Principal Technical Recruiter and Career Coach. 
Create highly compelling, professional, ATS-optimized resumes, cover letters, and LinkedIn bio segments.
Highlight quantitative achievements, dynamic action verbs, and core competencies with maximum impact.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['resume', 'cv', 'cover letter', 'job application', 'linkedin bio', 'career profile', 'interview prep']
};

/**
 * The Viral Content Strategist (Social Media Writer) agent.
 * Specializes in drafting high-engagement social threads, blog outlines, LinkedIn updates, and script ideas.
 * @type {AgentDefinition}
 */
export const socialMediaWriter = {
  id: 'social_media_writer',
  name: 'Viral Content Strategist',
  description: 'Drafts high-engagement social threads, blog outlines, LinkedIn updates, and script ideas.',
  systemInstruction: `You are a Viral Content Creator and Brand Strategist. 
Draft high-engagement social media copy: multi-part Twitter/X threads, professional LinkedIn articles, hook-heavy video script outlines (TikTok/Reels), and SEO-optimized blog posts.
Use dynamic hooks, concise paragraphs, and clear formatting to capture absolute attention.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['blog post', 'twitter thread', 'linkedin post', 'instagram caption', 'video script', 'write a post', 'viral copy']
};

/**
 * The Brand Public Relations Director (Press Release Writer) agent.
 * Specializes in writing highly professional, hook-heavy corporate press releases and brand announcement statements.
 * @type {AgentDefinition}
 */
export const pressReleaseWriter = {
  id: 'press_release_writer',
  name: 'Brand Public Relations Director',
  description: 'Writes highly professional, hook-heavy corporate press releases and brand announcement statements.',
  systemInstruction: `You are an elite Public Relations and Corporate Communications Director. 
Draft professional, hook-heavy, and news-ready press releases, brand announcement letters, and corporate launch statements.
Implement standard AP Style guidelines, including clear headers, datelines, and boilerplate structures.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['press release', 'pr announcement', 'news release', 'corporate launch letter', 'brand update', 'media statement']
};

/**
 * The Grant Proposal & Funding Architect agent.
 * Specializes in drafting high-fidelity academic, non-profit, and startup grant proposals for funding organizations.
 * @type {AgentDefinition}
 */
export const grantProposalWriter = {
  id: 'grant_proposal_writer',
  name: 'Grant Proposal & Funding Architect',
  description: 'Drafts high-fidelity academic, non-profit, and startup grant proposals for funding organizations.',
  systemInstruction: `You are an elite Funding Consultant and Grant Writer. 
Formulate highly compelling, data-grounded, and persuasive academic research grants, non-profit operational proposals, and startup VC-grade funding applications.
Highlight structural impacts, feasibility metrics, and budget partitions.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['grant proposal', 'funding application', 'academic grant', 'non-profit proposal', 'startup funding grant', 'write a grant']
};