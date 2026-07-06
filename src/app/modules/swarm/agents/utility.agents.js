// Added import for Vertex AI safety settings enums.
import { HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import winston from 'winston';
import httpStatus from 'http-status';
import ApiError from '../../../../errors/ApiError.js';

/**
 * A Winston logger configured for GCP Cloud Logging.
 * Logs are formatted as structured JSON with a 'severity' property that Cloud Logging
 * understands, allowing for automatic parsing of log levels (e.g., INFO, WARNING, ERROR).
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: 'info', // Default log level.
  format: winston.format.combine(
    winston.format.timestamp(), // Add a timestamp to each log.
    // Custom formatter to add the 'severity' field required by GCP Cloud Logging.
    // This must come BEFORE the json() formatter to ensure the field is added to the object before serialization.
    winston.format((info) => {
      info.severity = info.level.toUpperCase();
      return info;
    })(),
    winston.format.json() // Output logs in JSON format.
  ),
  transports: [
    // Log to the console. In GCP environments (Cloud Run, GKE, App Engine),
    // console output is automatically collected by the Cloud Logging agent.
    new winston.transports.Console(),
  ],
});

/**
 * Business Copywriting, Text Translation, and Productivity Specialists
 */

/**
 * @typedef {object} AgentDefinition
 * @property {string} id - Unique identifier for the agent.
 * @property {string} name - Human-readable name of the agent.
 * @property {string} description - A brief description of what the agent does.
 * @property {string} systemInstruction - The core system prompt/instruction for the agent, defining its persona and task.
 * @property {string} model - The AI model used by the agent (e.g., 'gemini-3.5-flash-001').
 * @property {Array<object>} safetySettings - Configuration for content safety filters. All model calls must include this.
 * @property {Array<string>} tools - A list of tools the agent can use (e.g., 'web_search', 'code_interpreter').
 * @property {Array<string>} keywords - A list of keywords associated with the agent for search and discovery.
 * @property {Array<string>} [dataHandlingNotes] - Developer notes for data pre-processing, e.g., ['PII_FILTERING_REQUIRED']. This is a reminder that the calling code must handle PII.
 */

/**
 * Enterprise-default safety settings for Google's generative AI models.
 * This configuration blocks content with a medium or higher probability of being unsafe across
 * several harm categories. It should be applied to all generative model calls unless
 * a specific override is provided by a Platform Owner.
 * @type {Array<{category: HarmCategory, threshold: HarmBlockThreshold}>}
 */
const defaultSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/**
 * Global Platform Owner overrides for utility agents.
 * This centralized configuration object allows Super Admins to manage the entire platform's agent behavior.
 * It includes controls for tenant suspension, global model/safety settings, and granular per-agent/per-tenant overrides.
 * This object should be managed via a secure admin API and persisted in a database or configuration store.
 * @type {{enabled: boolean, globalModelOverride: (string|null), globalSafetySettingsOverride: (Array<object>|null), overrides: object, tenantOverrides: object, disabledAgents: Set<string>, tenantDisabledAgents: object, suspendedTenants: Set<string>}}
 */
export const globalAgentOverrides = {
  enabled: true, // A master switch to enable/disable the entire override system. If false, all agents revert to their default definitions.
  globalModelOverride: null, // e.g., 'gemini-3.1-pro-001' to upgrade all agents globally for performance or feature reasons.
  globalSafetySettingsOverride: null, // e.g., to enforce stricter (BLOCK_LOW_AND_ABOVE) or looser safety settings platform-wide.
  overrides: {}, // Map of agentId -> Partial<AgentDefinition> for global, agent-specific overrides.
  tenantOverrides: {}, // Map of tenantId -> Map of agentId -> Partial<AgentDefinition> for tenant-specific customizations.
  disabledAgents: new Set(), // Set of agent IDs disabled globally by Platform Owner.
  tenantDisabledAgents: {}, // Map of tenantId -> Set of agent IDs disabled for a specific tenant.
  suspendedTenants: new Set(), // Set of tenant IDs whose access to all utility agents is completely revoked.
};

/**
 * Updates the global agent overrides configuration.
 * This function provides a safe, deep-merge update mechanism to prevent accidental data loss.
 * It is a highly sensitive operation and should be restricted to Platform Owner / Super Admin roles.
 * It includes robust error handling to prevent malformed input from crashing the application.
 * @param {object} newOverrides - The new overrides configuration. Can be a partial object.
 *        Passing `null` for a specific agent or tenant override will remove it.
 * @throws {ApiError} Throws a normalized ApiError if the update process fails due to invalid input.
 */
export function updateGlobalAgentOverrides(newOverrides) {
  try {
    // PLATFORM_OWNER_AUDIT_LOG: Log the entire newOverrides object and the admin user who initiated the change for security and compliance.
    logger.info({
      message: 'Attempting to update global agent overrides configuration.',
      component: 'AgentOverrides',
      event: 'UPDATE_GLOBAL_OVERRIDES_ATTEMPT',
      // For a complete audit trail, the ID of the admin user performing this action
      // should be captured from the request context and included here.
      // e.g., adminUserId: req.user.id,
      updatedConfig: newOverrides, // Log the new configuration for auditing.
    });

    if (newOverrides.enabled !== undefined) {
      globalAgentOverrides.enabled = newOverrides.enabled;
    }
    if (newOverrides.globalModelOverride !== undefined) {
      globalAgentOverrides.globalModelOverride = newOverrides.globalModelOverride;
    }
    if (newOverrides.globalSafetySettingsOverride !== undefined) {
      globalAgentOverrides.globalSafetySettingsOverride = newOverrides.globalSafetySettingsOverride;
    }
    if (newOverrides.suspendedTenants) {
      globalAgentOverrides.suspendedTenants = new Set(newOverrides.suspendedTenants);
    }
    if (newOverrides.disabledAgents) {
      globalAgentOverrides.disabledAgents = new Set(newOverrides.disabledAgents);
    }

    // Deep merge for agent-specific overrides to prevent data loss.
    if (newOverrides.overrides) {
      for (const [agentId, agentOverride] of Object.entries(newOverrides.overrides)) {
        if (agentOverride === null) {
          delete globalAgentOverrides.overrides[agentId]; // Allow removing an override by passing null.
        } else {
          globalAgentOverrides.overrides[agentId] = {
            ...(globalAgentOverrides.overrides[agentId] || {}),
            ...agentOverride,
          };
        }
      }
    }

    // Deep merge for tenant-specific overrides.
    if (newOverrides.tenantOverrides) {
      for (const [tenantId, agentOverrides] of Object.entries(newOverrides.tenantOverrides)) {
        if (agentOverrides === null) {
          delete globalAgentOverrides.tenantOverrides[tenantId]; // Allow removing all overrides for a tenant.
          continue;
        }
        if (!globalAgentOverrides.tenantOverrides[tenantId]) {
          globalAgentOverrides.tenantOverrides[tenantId] = {};
        }
        for (const [agentId, agentOverride] of Object.entries(agentOverrides)) {
          if (agentOverride === null) {
            delete globalAgentOverrides.tenantOverrides[tenantId][agentId]; // Allow removing a specific tenant-agent override.
          } else {
            globalAgentOverrides.tenantOverrides[tenantId][agentId] = {
              ...(globalAgentOverrides.tenantOverrides[tenantId][agentId] || {}),
              ...agentOverride,
            };
          }
        }
      }
    }

    // Rebuild tenant-disabled sets.
    if (newOverrides.tenantDisabledAgents) {
      for (const [tId, disabledList] of Object.entries(newOverrides.tenantDisabledAgents)) {
        if (disabledList === null || disabledList.length === 0) {
          delete globalAgentOverrides.tenantDisabledAgents[tId]; // Allow clearing disabled agents for a tenant.
        } else {
          globalAgentOverrides.tenantDisabledAgents[tId] = new Set(disabledList);
        }
      }
    }

    logger.info({
      message: 'Global agent overrides configuration updated successfully.',
      component: 'AgentOverrides',
      event: 'UPDATE_GLOBAL_OVERRIDES_SUCCESS',
    });
  } catch (error) {
    // Log the detailed internal error for debugging. This could happen if `newOverrides` has an invalid structure
    // (e.g., passing a non-iterable value to `new Set()`).
    logger.error({
      message: 'Failed to update global agent overrides configuration due to an internal error.',
      component: 'AgentOverrides',
      event: 'UPDATE_GLOBAL_OVERRIDES_FAILURE',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      invalidConfig: newOverrides, // Log the configuration that caused the failure for easier debugging.
    });

    // Throw a normalized API error to be handled by the global error handler.
    // This prevents leaking internal stack traces to the client.
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred while updating agent configuration. Please check the validity of the provided configuration data.'
    );
  }
}

/**
 * Resolves an agent's definition by applying any global or tenant-specific overrides.
 * This function is central to the multi-tenant permission and customization system.
 * The order of precedence for overrides is:
 * 1. Tenant-specific agent override
 * 2. Global agent-specific override
 * 3. Global platform-wide override (e.g., global model)
 * 4. Base agent definition
 * It also checks for tenant suspensions and disabled agents.
 * @param {AgentDefinition} baseAgent - The base agent definition from the agent library.
 * @param {string} [tenantId] - The ID of the tenant requesting the agent. If provided, tenant-specific rules are applied.
 * @returns {AgentDefinition|null} The resolved agent definition with all overrides applied, or `null` if the agent is
 *                                 unavailable to the tenant due to suspension or being disabled.
 */
export function resolveAgent(baseAgent, tenantId = null) {
  if (!baseAgent) return null;

  // If the override system is globally disabled by the Platform Owner, return the base agent definition.
  // This acts as a master "safe mode" switch, bypassing all other checks, including suspensions and disabled agents.
  if (!globalAgentOverrides.enabled) {
    return { ...baseAgent };
  }

  // 1. Check for Platform Owner suspensions and disables first.
  // Check if the entire tenant is suspended.
  if (tenantId && globalAgentOverrides.suspendedTenants.has(tenantId)) {
    // PLATFORM_OWNER_AUDIT_LOG: Log agent access attempt for suspended tenant 'tenantId'.
    logger.warn({
      message: 'Agent access denied for suspended tenant.',
      component: 'AgentResolver',
      event: 'ACCESS_DENIED_SUSPENDED_TENANT',
      tenantId: tenantId,
      agentId: baseAgent.id,
    });
    return null;
  }

  // Check if agent is globally disabled.
  if (globalAgentOverrides.disabledAgents.has(baseAgent.id)) {
    return null;
  }

  // Check if agent is disabled for this specific tenant.
  if (tenantId && globalAgentOverrides.tenantDisabledAgents[tenantId]?.has(baseAgent.id)) {
    return null;
  }

  const resolved = { ...baseAgent };
  const appliedOverrides = []; // For logging/auditing purposes.

  // 2. Apply global platform-wide overrides.
  if (globalAgentOverrides.globalModelOverride) {
    resolved.model = globalAgentOverrides.globalModelOverride;
    appliedOverrides.push('globalModel');
  }
  if (globalAgentOverrides.globalSafetySettingsOverride) {
    resolved.safetySettings = globalAgentOverrides.globalSafetySettingsOverride;
    appliedOverrides.push('globalSafety');
  }

  // 3. Apply global agent-specific overrides.
  const globalOverride = globalAgentOverrides.overrides[baseAgent.id];
  if (globalOverride) {
    Object.assign(resolved, globalOverride);
    appliedOverrides.push('globalAgentSpecific');
  }

  // 4. Apply tenant-specific overrides (most specific).
  if (tenantId && globalAgentOverrides.tenantOverrides[tenantId]) {
    const tenantOverride = globalAgentOverrides.tenantOverrides[tenantId][baseAgent.id];
    if (tenantOverride) {
      Object.assign(resolved, tenantOverride);
      appliedOverrides.push('tenantAgentSpecific');
    }
  }

  // PLATFORM_OWNER_AUDIT_LOG: If appliedOverrides.length > 0, log that agent 'baseAgent.id' was resolved for tenant 'tenantId' with overrides: appliedOverrides.join(', ').
  if (appliedOverrides.length > 0) {
    logger.info({
      message: 'Agent resolved with overrides applied.',
      component: 'AgentResolver',
      event: 'AGENT_RESOLVED_WITH_OVERRIDES',
      tenantId: tenantId,
      agentId: baseAgent.id,
      appliedOverrides: appliedOverrides,
    });
  }

  return resolved;
}

/**
 * Retrieves all available utility agents, applying context-specific overrides and permissions.
 * This function filters out any agents that are disabled globally or for the specific tenant.
 * It also returns an empty array if the entire tenant is suspended.
 * @param {string} [tenantId] - The optional tenant ID used to apply tenant-specific overrides and permission checks.
 * @returns {Array<AgentDefinition>} A list of resolved agent definitions available to the user or tenant.
 */
export function getAllUtilityAgents(tenantId = null) {
  // Platform Owner tenant suspension check. If suspended, the tenant has access to no utility agents.
  // This check respects the master 'enabled' switch.
  if (tenantId && globalAgentOverrides.enabled && globalAgentOverrides.suspendedTenants.has(tenantId)) {
    return [];
  }

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
    grantProposalWriter,
  ];
  return agents.map((agent) => resolveAgent(agent, tenantId)).filter((agent) => agent !== null);
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // User-provided documents may contain PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['translate', 'translation', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'polyglot'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // User-provided text for translation may contain PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['transcribe', 'transcription', 'audio', 'video', 'speech to text', 'timestamp', 'meeting minutes'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Transcripts of meetings or calls often contain PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['document', 'readme', 'wiki', 'documentation', 'api doc', 'technical writing', 'guide'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Source code or design docs may contain sensitive info.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['brainstorm', 'idea', 'creative', 'suggest', 'innovate', 'strategies', 'features'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Brainstorming may be based on confidential business data.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['copywriting', 'newsletter', 'landing page copy', 'marketing', 'outreach', 'email copy', 'blog post', 'technical writing'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Content may be based on confidential product plans.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['tailwind classes', 'ux design', 'ui design', 'layout structure', 'aria accessibility', 'css styling', 'responsive component', 'wireframe'],
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['seo', 'meta tag', 'json-ld', 'schema markup', 'meta description', 'keyword', 'sitemap', 'organic search', 'ranking'],
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['write me a letter', 'draft this email', 'send an email', 'write letter', 'email draft', 'memo', 'outreach email', 'cold mail', 'newsletter email'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Emails and letters are highly likely to contain PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['youtube transcript', 'video summary', 'summarize video', 'youtube notes', 'transcribe video', 'watch video summary'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Transcripts from private videos or meetings may contain PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['resume', 'cv', 'cover letter', 'job application', 'linkedin bio', 'career profile', 'interview prep'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Resumes and CVs are rich with PII.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['blog post', 'twitter thread', 'linkedin post', 'instagram caption', 'video script', 'write a post', 'viral copy'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Input may be based on confidential company information.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['press release', 'pr announcement', 'news release', 'corporate launch letter', 'brand update', 'media statement'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Press releases are often drafted using confidential pre-launch info.
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
  model: 'gemini-3.5-flash',
  safetySettings: defaultSafetySettings,
  tools: [],
  keywords: ['grant proposal', 'funding application', 'academic grant', 'non-profit proposal', 'startup funding grant', 'write a grant'],
  dataHandlingNotes: ['PII_FILTERING_REQUIRED'], // Grant proposals contain sensitive financial, personal, and research data.
};