/**
 * explorium.agent.js — LLM-Powered B2B Intelligence Agent
 *
 * Combines Explorium's 80M+ company database with Gemini AI to answer
 * natural-language business intelligence questions. This is Alti's
 * secret weapon against Perplexity — grounded, real B2B data + AI reasoning.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Exports:
 *   researchCompany(domain, question)       NL Q&A about any company
 *   buildICP(description)                   NL → Explorium filter JSON
 *   analyzeProspect(email, context)         Pre-meeting sales intelligence
 *   scoreLeads(businesses, icpDescription)  AI lead scoring 0-100
 *   generateOutreachEmail(prospect, sender) Hyper-personalized cold email
 *   naturalLanguageSearch(query, limit)     NL → business discovery
 *   summarizeCompany(domain)               Executive one-para briefing
 *   getCompanyTimeline(domain)              Key events chronology
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { logger } from '../../../shared/logger.js';
import {
  matchBusinessService,
  enrichBusinessSingleService,
  getCompanyIntelligenceService,
  getProspectIntelligenceService,
  fetchBusinessesService,
  businessStatisticsService,
  fetchBusinessEventsService,
  getDecisionMakersService,
  businessAutocompleteService,
} from './explorium.service.js';
import { withCache } from './explorium.cache.js';

// ─── Type Definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {object} ExploriumAgent.ResearchCompanyResult
 * @property {string} domain - The company domain that was researched.
 * @property {string|null} business_id - The unique identifier for the business in Explorium, if matched.
 * @property {string} answer - The AI-generated answer to the question.
 * @property {object|null} sources - Raw intelligence data used to generate the answer, categorized by type.
 * @property {object|null} [sources.firmographics] - Firmographic data.
 * @property {object|null} [sources.strategic_insights] - Strategic insights data.
 * @property {object|null} [sources.competitive_landscape] - Competitive landscape data.
 */

/**
 * @typedef {object} ExploriumAgent.ICPFilters
 * @property {object} [country_code] - ISO alpha-2 country codes, e.g., `{ values: ["us", "gb"] }`.
 * @property {object} [company_size] - Company size ranges, e.g., `{ values: ["51-200", "201-500"] }`.
 * @property {object} [company_revenue] - Company revenue ranges, e.g., `{ values: ["1M-5M", "5M-10M"] }`.
 * @property {object} [company_age] - Company age ranges, e.g., `{ values: ["3-6", "6-10"] }`.
 * @property {object} [linkedin_category] - LinkedIn industry categories, e.g., `{ values: ["software development"] }`.
 * @property {object} [naics_category] - NAICS codes, e.g., `{ values: ["541512"] }`.
 * @property {object} [google_category] - Google business categories, e.g., `{ values: ["Software company"] }`.
 * @property {object} [company_tech_stack_tech] - Specific technologies, e.g., `{ values: ["Salesforce", "HubSpot"] }`.
 * @property {object} [company_tech_stack_category] - Technology categories, e.g., `{ values: ["CRM", "Marketing"] }`.
 * @property {object} [has_website] - Whether the company has a website, e.g., `{ values: [true] }`.
 * @property {object} [is_public_company] - Whether the company is public, e.g., `{ values: [true] }`.
 * @property {object} [website_keywords] - Keywords found on the company website, e.g., `{ values: ["AI", "SaaS"] }`.
 * @property {object} [number_of_locations] - Number of company locations, e.g., `{ values: ["2-5", "6-20"] }`.
 * @property {object} [business_intent_topics] - Business intent topics with an optional intent level.
 * @property {Array<string>} [business_intent_topics.values] - List of intent topics.
 * @property {string} [business_intent_topics.topic_intent_level] - Intent level, e.g., "high_intent".
 */

/**
 * @typedef {object} ExploriumAgent.ICPBuilderResult
 * @property {string} description - The original natural language ICP description.
 * @property {ExploriumAgent.ICPFilters} filters - The generated Explorium API filter object.
 * @property {string} explanation - A brief reasoning for the chosen filters.
 * @property {number} estimated_count - The estimated number of businesses matching the filters.
 */

/**
 * @typedef {object} ExploriumAgent.ProspectAnalysisResult
 * @property {string} email - The email address of the prospect.
 * @property {boolean} matched - True if Explorium data was found for the prospect, false otherwise.
 * @property {string} brief - The AI-generated pre-meeting sales intelligence brief.
 * @property {string|null} prospect_id - The unique identifier for the prospect in Explorium, if matched.
 * @property {object|null} raw_intel - The raw intelligence data from Explorium for the prospect.
 * @property {string} [meeting_context] - The context provided for the meeting.
 */

/**
 * @typedef {object} ExploriumAgent.LeadScore
 * @property {string} id - The unique identifier of the business.
 * @property {number} score - The ICP fit score (0-100).
 * @property {('A'|'B'|'C'|'D')} tier - The lead tier based on the score.
 * @property {string} reasoning - A 2-sentence explanation for the score.
 */

/**
 * @typedef {object} ExploriumAgent.ProspectData
 * @property {string} [first_name] - Prospect's first name.
 * @property {string} [full_name] - Prospect's full name.
 * @property {string} [email] - Prospect's email.
 * @property {string} [job_title] - Prospect's job title.
 * @property {string} [company_name] - Prospect's company name.
 * @property {string} [job_department_main] - Prospect's main job department.
 * @property {string} [job_level_main] - Prospect's main job level.
 * @property {string} [city] - Prospect's city.
 * @property {string} [region_name] - Prospect's region/state.
 * @property {Array<object>} [experience] - Array of past work experiences.
 * @property {Array<string>} [skills] - Array of skills.
 */

/**
 * @typedef {object} ExploriumAgent.SenderData
 * @property {string} name - Sender's name.
 * @property {string} company - Sender's company name.
 * @property {string} product - Name of the product/service being offered.
 * @property {string} value_prop - A concise value proposition of the product/service.
 */

/**
 * @typedef {object} ExploriumAgent.OutreachEmailResult
 * @property {string} subject - The AI-generated email subject line.
 * @property {string} body - The AI-generated email body.
 * @property {string} ps - An optional AI-generated postscript.
 */

/**
 * @typedef {object} ExploriumAgent.NLSearchResult
 * @property {string} query - The original natural language search query.
 * @property {ExploriumAgent.ICPFilters} filters_used - The Explorium API filters derived from the query.
 * @property {string} explanation - A brief explanation of how the query was translated into filters.
 * @property {number} total_available - The total estimated number of businesses matching the filters.
 * @property {Array<object>} results - An array of business objects matching the query.
 * @property {number} returned - The number of businesses returned in the current result set.
 */

/**
 * @typedef {object} ExploriumAgent.CompanySummaryResult
 * @property {string} domain - The company domain that was summarized.
 * @property {string|null} business_id - The unique identifier for the business in Explorium, if matched.
 * @property {string} summary - A 2-3 sentence executive overview of the company.
 * @property {Array<string>} key_facts - A list of key factual bullet points about the company.
 * @property {object} raw_data - Raw intelligence data used for the summary.
 * @property {object|null} [raw_data.firmographics] - Firmographic data.
 * @property {object|null} [raw_data.funding_and_acquisitions] - Funding and acquisitions data.
 */

/**
 * @typedef {object} ExploriumAgent.CompanyEvent
 * @property {string} event_type - Type of event, e.g., "funding", "acquisition", "news".
 * @property {string} occurred_at - Date of the event in ISO format.
 * @property {string} summary - A brief summary of the event.
 * @property {object} [event_data] - Additional detailed data about the event.
 */

/**
 * @typedef {object} ExploriumAgent.CompanyTimelineResult
 * @property {string} domain - The company domain for which the timeline was generated.
 * @property {string|null} business_id - The unique identifier for the business in Explorium, if matched.
 * @property {string} narrative - An AI-generated narrative summarizing the company's recent events.
 * @property {Array<ExploriumAgent.CompanyEvent>} events - A list of raw event objects.
 * @property {number} event_count - The total number of events found.
 * @property {number} [lookback_days] - The number of days looked back for events.
 */

// ─── LLM Helper ───────────────────────────────────────────────────────────────

/**
 * Calls the Gemini LLM with a given prompt and optional system prompt.
 * Configures the model for JSON output if `jsonMode` is true.
 *
 * @async
 * @param {string} prompt - The main prompt for the LLM.
 * @param {string} [systemPrompt=''] - An optional system prompt to guide the LLM's persona or instructions.
 * @param {boolean} [jsonMode=false] - If true, configures the LLM to return a JSON response.
 * @returns {Promise<string|null>} A promise that resolves to the LLM's text response, or null if an error occurs.
 */
async function callLLM(prompt, systemPrompt = '', jsonMode = false) {
  try {
    const apiKey = (
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      ''
    ).trim();

    if (!apiKey) throw new Error('No Gemini API key configured');

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    });

    const parts = systemPrompt
      ? [{ text: systemPrompt }, { text: '\n\n' }, { text: prompt }]
      : [{ text: prompt }];

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    return result.response.text();
  } catch (err) {
    logger.error('[Explorium Agent] LLM error:', err.message);
    return null;
  }
}

/**
 * Safely parses a JSON string, attempting to clean common LLM output formatting (e.g., markdown code blocks).
 * If parsing fails, it returns a specified fallback object.
 *
 * @param {string} raw - The raw string potentially containing JSON.
 * @param {object} [fallback={}] - The object to return if JSON parsing fails.
 * @returns {object} The parsed JSON object or the fallback object.
 */
function safeParseJson(raw, fallback = {}) {
  try {
    const cleaned = (raw || '').replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

// ─── Company Research ─────────────────────────────────────────────────────────

/**
 * Answer a natural-language question about any company using Explorium's extensive B2B data.
 * This function leverages AI to synthesize information from various intelligence categories
 * (firmographics, strategic insights, competitive landscape, workforce trends, funding)
 * to provide a data-driven answer.
 *
 * @async
 * @param {string} domain - The company domain, e.g., "stripe.com".
 * @param {string} question - The natural language question about the company.
 * @returns {Promise<ExploriumAgent.ResearchCompanyResult>} A promise that resolves to an object containing the AI-generated answer, business ID, domain, and raw data sources.
 */
export async function researchCompany(domain, question) {
  logger.info(`[Explorium Agent] Research: ${domain} — "${question}"`);

  const enrichTypes = [
    'firmographics', 'strategic_insights', 'competitive_landscape',
    'workforce_trends', 'funding_and_acquisitions',
  ];

  const intel = await withCache(
    'competitive_landscape',
    { domain, enrichTypes },
    () => getCompanyIntelligenceService(domain, enrichTypes)
  );

  if (!intel?.matched) {
    return {
      domain,
      answer: `No Explorium match for "${domain}". Check the domain is correct (e.g. "stripe.com").`,
      sources: null,
      business_id: null,
    };
  }

  const context = JSON.stringify(intel.data, null, 2).slice(0, 14000);

  const systemPrompt = `You are an elite B2B market intelligence analyst with access to Explorium's proprietary database of 80M+ companies. Provide precise, data-driven answers. Always cite specific numbers, percentages, or named facts from the provided intelligence data. If the data is insufficient, say so explicitly.`;

  const prompt = `COMPANY: ${domain}\nBUSINESS ID: ${intel.business_id}\n\nINTELLIGENCE DATA:\n${context}\n\nQUESTION: ${question}\n\nAnswer concisely with specific facts from the data above. Format with bullet points where appropriate.`;

  const answer = await callLLM(prompt, systemPrompt);

  return {
    domain,
    business_id: intel.business_id,
    answer: answer || 'Analysis unavailable.',
    sources: {
      firmographics:        intel.data?.firmographics || null,
      strategic_insights:   intel.data?.strategic_insights || null,
      competitive_landscape: intel.data?.competitive_landscape || null,
    },
  };
}

// ─── ICP Builder ──────────────────────────────────────────────────────────────

/**
 * Converts a natural language Ideal Customer Profile (ICP) description into valid Explorium API filters.
 * It includes a post-processing step to semantically map business intent topics to verified taxonomy topics
 * and validates the generated filters against a live audience count.
 *
 * @async
 * @param {string} description - A natural language description of the ICP, e.g., "Series B SaaS companies in the US with 50-500 employees using Salesforce".
 * @returns {Promise<ExploriumAgent.ICPBuilderResult>} A promise that resolves to an object containing the generated filters, an explanation, and the estimated audience count.
 */
export async function buildICP(description) {
  logger.info(`[Explorium Agent] Build ICP: "${description}"`);

  const systemPrompt = `You are a B2B data expert who converts natural language ICP descriptions into structured Explorium API filter objects. Return ONLY valid JSON with no markdown, no explanation text outside the JSON.

Valid filter keys and their accepted values:
- country_code: ISO alpha-2 codes e.g. ["us","gb","ca","de","au"]
- company_size: ["1-10","11-50","51-200","201-500","501-1000","1001-5000","5001-10000","10001+"]
- company_revenue: ["0-500K","500K-1M","1M-5M","5M-10M","10M-25M","25M-75M","75M-200M","200M-500M","500M-1B","1B-10B","10B-100B"]
- company_age: ["0-3","3-6","6-10","10-20","20+"]
- linkedin_category: string e.g. ["software development","fintech","information technology and services"]
- naics_category: NAICS code strings e.g. ["541512","52"]
- google_category: string e.g. ["Retail","Software company"]
- company_tech_stack_tech: specific tech names e.g. ["Salesforce","HubSpot","AWS","Stripe"]
- company_tech_stack_category: ["CRM","Marketing","Cloud Services","Analytics","Security","DevOps And Development"]
- has_website: { values: [true] }
- is_public_company: { values: [true] } or { values: [false] }
- website_keywords: { values: ["keyword1","keyword2"] }
- number_of_locations: ["0-1","2-5","6-20","21-50","51-100","101-1000","1001+"]
- business_intent_topics: { values: ["topic1","topic2"], topic_intent_level: "high_intent" }

Output format:
{
  "filters": { <key>: { "values": [...] } },
  "explanation": "Brief reasoning for each filter choice"
}`;

  const prompt = `Convert this ICP to Explorium API filters:\n\n"${description}"\n\nReturn ONLY the JSON object.`;

  const raw = await callLLM(prompt, systemPrompt, true);
  const parsed = safeParseJson(raw, { filters: {}, explanation: 'Could not parse response' });

  // ⚡ Post-process intent topics semantically to map them to verified Bombora taxonomy topics
  if (parsed.filters && parsed.filters.business_intent_topics) {
    const intentObj = parsed.filters.business_intent_topics;
    let originalTopics = Array.isArray(intentObj.values) ? intentObj.values : [];

    // If LLM mistakenly put topics in 'topics' property, merge them and clean up
    if (Array.isArray(intentObj.topics) && intentObj.topics.length > 0) {
      originalTopics = [...originalTopics, ...intentObj.topics];
      delete intentObj.topics; // Remove the incorrect property
    }

    if (originalTopics.length > 0) {
      const verifiedTopics = [];
      for (const topic of originalTopics) {
        try {
          const suggestions = await withCache('business_autocomplete', { field: 'business_intent_topics', query: topic, semantic_search: true }, () =>
            businessAutocompleteService('business_intent_topics', topic, true).catch(() => [])
          );
          if (suggestions && suggestions.length > 0) {
            verifiedTopics.push(suggestions[0]);
            logger.info(`[Explorium Agent] ICP Filter Topic mapped: "${topic}" -> "${suggestions[0]}"`);
          } else {
            // If no semantic suggestion, keep the original topic, but log a warning
            logger.warn(`[Explorium Agent] No semantic match for ICP topic "${topic}". Keeping original.`);
            verifiedTopics.push(topic);
          }
        } catch (err) {
          logger.warn(`[Explorium Agent] Autocomplete error for ICP topic "${topic}": ${err.message}`);
          verifiedTopics.push(topic);
        }
      }
      intentObj.values = verifiedTopics; // Correctly set the 'values' property as per system prompt
      if (!intentObj.topic_intent_level) {
        intentObj.topic_intent_level = 'high_intent';
      }
    } else {
      // If no valid topics were found after processing, remove the filter entirely
      delete parsed.filters.business_intent_topics;
    }
  }

  // Validate with live audience count
  let estimatedCount = 0;
  try {
    const stats = await businessStatisticsService(parsed.filters || {});
    estimatedCount = stats?.count ?? stats?.total_results ?? 0;
  } catch { /* Count is informational only */ }

  return {
    description,
    filters:         parsed.filters || {},
    explanation:     parsed.explanation || '',
    estimated_count: estimatedCount,
  };
}

// ─── Prospect Intelligence ────────────────────────────────────────────────────

/**
 * Generates a comprehensive pre-meeting sales intelligence brief for a prospect.
 * It uses Explorium's contact intelligence to synthesize information about the prospect's
 * professional profile, company, and potential pain points, tailored to a given meeting context.
 *
 * @async
 * @param {string} email - The prospect's work email address.
 * @param {string} [context=''] - Optional context for the meeting (e.g., "selling CRM", "partnership discussion").
 * @returns {Promise<ExploriumAgent.ProspectAnalysisResult>} A promise that resolves to an object containing the prospect's email, match status, the AI-generated brief, prospect ID, and raw intelligence data.
 */
export async function analyzeProspect(email, context = '') {
  logger.info(`[Explorium Agent] Analyze prospect: ${email}`);

  const intel = await withCache(
    'professional_profile',
    { email },
    () => getProspectIntelligenceService(email)
  );

  if (!intel?.matched) {
    return {
      email,
      matched: false,
      brief: `No Explorium data found for ${email}.`,
      prospect_id: null,
      raw_intel: null,
    };
  }

  const { professional_profile, contacts_information, social_media } = intel.data || {};
  const ctxJson = JSON.stringify(
    { professional_profile, contacts_information, social_media },
    null, 2
  ).slice(0, 10000);

  const systemPrompt = `You are a world-class B2B sales coach preparing reps for high-stakes meetings. Use the provided Explorium contact intelligence to create a specific, actionable pre-meeting brief. Reference REAL data points — specific job titles, company names, tenure durations, skills.`;

  const prompt = `CONTACT: ${email}
MEETING CONTEXT: ${context || 'General sales discovery call'}

EXPLORIUM INTELLIGENCE:
${ctxJson}

Write a pre-meeting brief with these exact sections:
## Who They Are
[Role, background, years of experience, key skills]

## Their Company
[Size, industry, tech stack, recent signals]

## 3 Tailored Talking Points
[Specific to their background and context, not generic]

## Likely Pain Points
[Based on their role, department, company stage]

## Watch Out For
[Potential objections or sensitivities based on data]

Be specific. Reference actual data values.`;

  const brief = await callLLM(prompt, systemPrompt);

  return {
    email,
    prospect_id: intel.prospect_id,
    matched: true,
    meeting_context: context,
    brief: brief || 'Analysis unavailable.',
    raw_intel: intel.data,
  };
}

// ─── AI Lead Scoring ──────────────────────────────────────────────────────────

/**
 * Scores a list of businesses based on their fit with a natural language Ideal Customer Profile (ICP).
 * The function processes businesses in batches to optimize LLM token usage and provides a score (0-100),
 * a tier (A, B, C, D), and a brief reasoning for each lead.
 *
 * @async
 * @param {Array<object>} businesses - An array of business objects, typically from `fetchBusinessesService`.
 *                                     Each object should ideally contain `business_id` (or `id`), `name` (or `company_name`),
 *                                     `company_size`, `linkedin_category` (or `google_category`, `naics_category`),
 *                                     `company_revenue`, `country_code`, `tech_stack` (or `technologies`), `founded_year`, `domain` (or `website`).
 * @param {string} icpDescription - A natural language description of the Ideal Customer Profile.
 * @returns {Promise<Array<ExploriumAgent.LeadScore>>} A promise that resolves to an array of lead score objects, sorted by score in descending order.
 */
export async function scoreLeads(businesses, icpDescription) {
  logger.info(`[Explorium Agent] Scoring ${businesses.length} leads`);
  if (!businesses.length) return [];

  const systemPrompt = `You are a B2B revenue intelligence AI. Score companies on ICP fit (0-100) with precise reasoning. Tiers: A=80-100, B=60-79, C=40-59, D=0-39. Return ONLY a JSON array.`;

  const BATCH_SIZE = 10;
  const allResults = [];

  for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
    const batch = businesses.slice(i, i + BATCH_SIZE);

    const minified = batch.map((b) => ({
      id:       b.business_id || b.id,
      name:     b.name || b.company_name,
      size:     b.company_size,
      industry: b.linkedin_category || b.google_category || b.naics_category,
      revenue:  b.company_revenue,
      country:  b.country_code,
      tech:     (b.tech_stack || b.technologies || []).slice(0, 5),
      founded:  b.founded_year,
      website:  b.domain || b.website,
    }));

    const prompt = `ICP: "${icpDescription}"

Score these companies:
${JSON.stringify(minified, null, 2)}

Return JSON array: [{"id":"...","score":85,"tier":"A","reasoning":"2-sentence specific explanation"}]`;

    const raw = await callLLM(prompt, systemPrompt, true);
    const scored = safeParseJson(raw, []);

    if (Array.isArray(scored) && scored.length > 0) {
      allResults.push(...scored);
    } else {
      // Fallback: neutral score for failed batch
      batch.forEach((b) =>
        allResults.push({
          id: b.business_id || b.id,
          score: 50,
          tier: 'C',
          reasoning: 'Insufficient data for scoring.',
        })
      );
    }
  }

  return allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ─── Outreach Email Generation ────────────────────────────────────────────────

/**
 * Generates a hyper-personalized cold outreach email using Explorium contact data and sender information.
 * The AI crafts a subject line, body, and an optional postscript, adhering to best practices for high reply rates.
 *
 * @async
 * @param {ExploriumAgent.ProspectData} prospect - An object containing detailed prospect data (e.g., from `enrichProspectSingle` or `fetchProspects`).
 * @param {ExploriumAgent.SenderData} sender - An object containing sender's details: `name`, `company`, `product`, and `value_prop`.
 * @param {string} [context=''] - Additional context for the email, explaining the specific reason for reaching out now.
 * @returns {Promise<ExploriumAgent.OutreachEmailResult>} A promise that resolves to an object containing the generated subject, body, and PS of the email.
 */
export async function generateOutreachEmail(prospect, sender, context = '') {
  logger.info(`[Explorium Agent] Outreach: ${prospect?.full_name || prospect?.email}`);

  const pSummary = {
    name:       prospect.first_name || prospect.full_name?.split(' ')[0],
    full_name:  prospect.full_name,
    title:      prospect.job_title,
    company:    prospect.company_name,
    department: prospect.job_department_main,
    seniority:  prospect.job_level_main,
    location:   [prospect.city, prospect.region_name].filter(Boolean).join(', '),
    experience: (prospect.experience || []).slice(0, 4),
    skills:     (prospect.skills || []).slice(0, 6),
  };

  const systemPrompt = `You are a top-performing B2B SDR who writes cold emails with 40%+ reply rates. Rules:
- First sentence MUST reference something SPECIFIC about the prospect (their title, company, recent role, specific skill)
- Body is max 4 sentences, conversational tone, no fluff
- ONE clear low-friction CTA (15-min call, quick question, feedback)
- Never mention "I came across your profile" or "hope this email finds me well"
- PS line is optional but must be clever or genuinely curious
- Return ONLY valid JSON`;

  const prompt = `SENDER: ${JSON.stringify(sender)}
PROSPECT: ${JSON.stringify(pSummary)}
CONTEXT: ${context || 'Standard outreach'}

Generate the email. Return JSON: {"subject":"...","body":"...","ps":"..."}`;

  const raw = await callLLM(prompt, systemPrompt, true);
  const parsed = safeParseJson(raw, {});

  return {
    subject: parsed.subject || `${pSummary.name}, quick question`,
    body: parsed.body || `Hi ${pSummary.name},\n\nI noticed your work at ${pSummary.company} and wanted to share how ${sender.product} might help.\n\nWould a 15-minute call make sense?`,
    ps: parsed.ps || '',
  };
}

// ─── Natural Language Search ──────────────────────────────────────────────────

/**
 * Discovers businesses by converting a natural language query into Explorium API filters
 * and then fetching matching business results. This provides a powerful way to find
 * companies without needing to manually construct complex filter objects.
 *
 * @async
 * @param {string} query - The natural language query for business discovery, e.g., "fast-growing AI startups in NYC under 200 employees".
 * @param {number} [limit=20] - The maximum number of business results to return (default is 20, max 100).
 * @returns {Promise<ExploriumAgent.NLSearchResult>} A promise that resolves to an object containing the original query, filters used, an explanation, total available count, and the list of matching businesses.
 */
export async function naturalLanguageSearch(query, limit = 20) {
  logger.info(`[Explorium Agent] NL Search: "${query}"`);

  const icp = await buildICP(query);

  const results = await fetchBusinessesService({
    filters:   icp.filters,
    mode:      'full',
    page_size: Math.min(limit, 100),
    size:      limit,
  });

  return {
    query,
    filters_used:    icp.filters,
    explanation:     icp.explanation,
    total_available: icp.estimated_count,
    results:         results?.data || [],
    returned:        results?.data?.length || 0,
  };
}

// ─── Company Summary ──────────────────────────────────────────────────────────

/**
 * Generates an executive-ready one-paragraph company summary along with key factual bullet points.
 * It synthesizes information from various Explorium intelligence categories like firmographics,
 * funding, workforce trends, and strategic insights.
 *
 * @async
 * @param {string} domain - The company domain, e.g., "google.com".
 * @returns {Promise<ExploriumAgent.CompanySummaryResult>} A promise that resolves to an object containing the domain, business ID, AI-generated summary, key facts, and raw data used.
 */
export async function summarizeCompany(domain) {
  logger.info(`[Explorium Agent] Summarize: ${domain}`);

  const intel = await withCache(
    'firmographics',
    { domain, summary: true },
    () => getCompanyIntelligenceService(domain, [
      'firmographics', 'funding_and_acquisitions', 'workforce_trends',
      'company_social_media', 'strategic_insights',
    ])
  );

  if (!intel?.matched) {
    return {
      domain,
      business_id: null,
      summary: `${domain} was not found in Explorium's database of 80M+ companies.`,
      key_facts: [],
    };
  }

  const ctx = JSON.stringify(intel.data, null, 2).slice(0, 8000);

  const systemPrompt = `You are a business intelligence analyst. Write concise, factual executive briefings for busy founders and sales leaders. No filler words.`;

  const prompt = `Write an executive summary for ${domain} based on this Explorium intelligence data:

${ctx}

Return JSON:
{
  "summary": "2-3 sentence executive overview with specific facts (revenue, headcount, HQ, stage)",
  "key_facts": ["fact1 with number", "fact2 with number", "fact3 with number", "fact4", "fact5"]
}`;

  const raw = await callLLM(prompt, systemPrompt, true);
  const parsed = safeParseJson(raw, {});

  return {
    domain,
    business_id: intel.business_id,
    summary:     parsed.summary || `${domain} — data available, summary generation failed.`,
    key_facts:   parsed.key_facts || [],
    raw_data:    {
      firmographics:          intel.data?.firmographics || null,
      funding_and_acquisitions: intel.data?.funding_and_acquisitions || null,
    },
  };
}

// ─── Company Event Timeline ───────────────────────────────────────────────────

/**
 * Fetches a company's recent events and generates an AI-powered narrative summarizing
 * what's been happening and what it signals about the company's direction.
 *
 * @async
 * @param {string} domain - The company domain, e.g., "microsoft.com".
 * @param {number} [lastDays=30] - The lookback window in days for fetching events (typically 30-90).
 * @returns {Promise<ExploriumAgent.CompanyTimelineResult>} A promise that resolves to an object containing the domain, business ID, AI-generated narrative, raw event list, and event count.
 */
export async function getCompanyTimeline(domain, lastDays = 30) {
  logger.info(`[Explorium Agent] Timeline: ${domain} (last ${lastDays} days)`);

  const match = await withCache(
    'match_business',
    { domain },
    () => matchBusinessService({ domain })
  );

  if (!match?.business_id) {
    return { domain, business_id: null, narrative: 'Company not found.', events: [], event_count: 0 };
  }

  const events = await withCache(
    'business_events',
    { businessId: match.business_id, lastDays },
    () => fetchBusinessEventsService([match.business_id], [], lastDays)
  );

  const eventList = events?.data || events?.events || [];

  if (!eventList.length) {
    return {
      domain,
      business_id: match.business_id,
      narrative:   `No recorded events for ${domain} in the last ${lastDays} days.`,
      events:      [],
      event_count: 0,
    };
  }

  // Summarize events with AI
  const eventSummary = eventList.slice(0, 20).map((e) => ({
    type: e.event_type,
    date: e.occurred_at || e.date,
    summary: e.summary || e.event_data?.summary || '',
  }));

  const systemPrompt = `You are a business intelligence analyst. Narrate company events in a clear, engaging 2-3 paragraph story for a busy executive.`;

  const prompt = `Narrate these recent events for ${domain}:\n\n${JSON.stringify(eventSummary, null, 2)}\n\nTell the story of what's been happening at this company. What does it signal about their direction?`;

  const narrative = await callLLM(prompt, systemPrompt);

  return {
    domain,
    business_id: match.business_id,
    lookback_days: lastDays,
    event_count: eventList.length,
    narrative: narrative || 'Narrative generation failed.',
    events: eventList,
  };
}

// ─── Named Export ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} ExploriumAgent
 * @property {function(string, string): Promise<ExploriumAgent.ResearchCompanyResult>} researchCompany - NL Q&A about any company.
 * @property {function(string): Promise<ExploriumAgent.ICPBuilderResult>} buildICP - Converts NL to Explorium filter JSON.
 * @property {function(string, string): Promise<ExploriumAgent.ProspectAnalysisResult>} analyzeProspect - Generates pre-meeting sales intelligence.
 * @property {function(Array<object>, string): Promise<Array<ExploriumAgent.LeadScore>>} scoreLeads - AI lead scoring (0-100).
 * @property {function(ExploriumAgent.ProspectData, ExploriumAgent.SenderData, string): Promise<ExploriumAgent.OutreachEmailResult>} generateOutreachEmail - Generates hyper-personalized cold emails.
 * @property {function(string, number): Promise<ExploriumAgent.NLSearchResult>} naturalLanguageSearch - NL business discovery.
 * @property {function(string): Promise<ExploriumAgent.CompanySummaryResult>} summarizeCompany - Executive one-paragraph briefing.
 * @property {function(string, number): Promise<ExploriumAgent.CompanyTimelineResult>} getCompanyTimeline - Key events chronology.
 */

/**
 * An exported constant object containing all the AI-powered Explorium agent functions.
 * This serves as the primary interface for interacting with the Explorium intelligence agent.
 *
 * @constant
 * @type {ExploriumAgent}
 */
export const ExploriumAgent = {
  researchCompany,
  buildICP,
  analyzeProspect,
  scoreLeads,
  generateOutreachEmail,
  naturalLanguageSearch,
  summarizeCompany,
  getCompanyTimeline,
};