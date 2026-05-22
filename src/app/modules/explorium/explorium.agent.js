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

// ─── LLM Helper ───────────────────────────────────────────────────────────────

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
 * Answer a natural-language question about any company using Explorium data.
 *
 * @param {string} domain    - Company domain, e.g. "stripe.com"
 * @param {string} question  - Any question about the company
 * @returns {Promise<{answer, business_id, domain, sources}>}
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
 * Convert a natural language ICP description into valid Explorium API filters.
 * Includes live audience count validation.
 *
 * @param {string} description - e.g. "Series B SaaS companies in the US with 50-500 employees using Salesforce"
 * @returns {Promise<{filters, explanation, estimated_count, description}>}
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
    const originalTopics = intentObj.topics || intentObj.values || [];
    if (Array.isArray(originalTopics) && originalTopics.length > 0) {
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
            verifiedTopics.push(topic);
          }
        } catch (err) {
          logger.warn(`[Explorium Agent] Autocomplete error for ICP topic "${topic}": ${err.message}`);
          verifiedTopics.push(topic);
        }
      }
      intentObj.topics = verifiedTopics;
      delete intentObj.values;
      if (!intentObj.topic_intent_level) {
        intentObj.topic_intent_level = 'high_intent';
      }
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
 * Generate a pre-meeting sales intelligence brief for a prospect by email.
 *
 * @param {string} email    - Prospect's work email
 * @param {string} context  - Meeting context ("selling CRM", "partnership discussion")
 * @returns {Promise<{email, matched, brief, prospect_id, raw_intel}>}
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
 * Score a list of businesses on ICP fit (0-100) using AI reasoning.
 * Processes in batches of 10 to stay within LLM token limits.
 *
 * @param {Array<object>} businesses   - Business objects from fetchBusinesses
 * @param {string}        icpDescription - Natural language ICP
 * @returns {Promise<Array<{id, score, tier, reasoning}>>}
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
 * Generate a hyper-personalized cold outreach email using Explorium contact data.
 *
 * @param {object} prospect  - Prospect data (from enrichProspectSingle or fetchProspects)
 * @param {object} sender    - { name, company, product, value_prop }
 * @param {string} context   - Additional context (why reaching out now)
 * @returns {Promise<{subject, body, ps}>}
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
- Never mention "I came across your profile" or "hope this email finds you well"
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
 * Discover businesses using a natural language query.
 * Converts query → Explorium filters → results in one shot.
 *
 * @param {string} query  - e.g. "fast-growing AI startups in NYC under 200 employees"
 * @param {number} limit  - Max results (default 20)
 * @returns {Promise<{query, filters_used, explanation, total_available, results, returned}>}
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
 * Generate an executive-ready one-paragraph company summary + key facts.
 *
 * @param {string} domain
 * @returns {Promise<{domain, business_id, summary, key_facts}>}
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
 * Fetch and narrate a company's recent event timeline.
 * Returns both raw events and an AI-generated narrative of what's happening.
 *
 * @param {string} domain
 * @param {number} lastDays  - Lookback window (30-90)
 * @returns {Promise<{domain, business_id, narrative, events, event_count}>}
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
