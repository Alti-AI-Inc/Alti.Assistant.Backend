/**
 * explorium.smart.router.js — Explorium Data Pre-Injection Middleware
 *
 * This file is the bridge between the SynapseRouter (which picks the agent)
 * and the LLM call (which needs live data). For every Explorium agent, this
 * middleware:
 *
 *   1. Parses the user's query to extract entities (domain, email, company name, keywords)
 *   2. Calls the right Explorium service function(s) based on the matched agent ID
 *   3. Returns a structured context string that gets injected into the LLM prompt
 *
 * The LLM then reasons over real, grounded data — not hallucinated guesses.
 *
 * Agent → Explorium API Mapping:
 *   explorium_company_researcher → matchBusiness + enrichBusiness (firmographics, funding, competitive, workforce, strategic)
 *   explorium_prospect_hunter    → fetchProspects (by company domain/name + seniority filters)
 *   explorium_signal_scout       → fetchBusinessEvents + fundingRadar + hiringSignals + intentSignals
 *   explorium_icp_builder        → buildICP (NL→filters) + businessStatistics + fetchBusinesses (sample)
 *   explorium_sales_coach        → matchProspect + enrichProspect (profile, contacts, social)
 *   explorium_lead_scorer        → enrichBusiness (firmographics, technographics, funding) for each company
 *   explorium_outreach_writer    → matchBusiness + enrichBusiness + matchProspect + enrichProspect
 *   explorium_market_mapper      → keywordSearch + lookalikeBusiness + competitiveLandscape
 */

import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import {
  matchBusinessesService,
  matchBusinessService,
  bulkEnrichBusinessesService,
  enrichBusinessSingleService,
  fetchProspectsService,
  fetchBusinessesService,
  businessStatisticsService,
  fetchBusinessEventsService,
  matchProspectService,
  enrichProspectSingleService,
  getCompanyIntelligenceService,
  getProspectIntelligenceService,
  getFundingRadarService,
  getHiringSignalsService,
  getLookalikeCompaniesService,
  getIntentSignalsService,
  businessAutocompleteService,
  getDecisionMakersService,
  addBusinessEnrollmentsService,
} from '../../modules/explorium/explorium.service.js';
import {
  buildICP,
  researchCompany,
  analyzeProspect,
  naturalLanguageSearch,
} from '../../modules/explorium/explorium.agent.js';
import { withCache, withCacheBatch } from '../../modules/explorium/explorium.cache.js';
import { googleSearch } from '../../modules/search/tools.js';

// ─── Entity extraction ────────────────────────────────────────────────────────

/**
 * Checks if a string looks like a domain.
 */
function isDomain(str) {
  if (!str) return false;
  return /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?$/.test(str.trim());
}

/**
 * Resolves entities (domain, email, companyName) from current query or conversation history.
 * Multi-turn memory allows queries like "who is their CTO?" or "what is their funding?" to resolve correctly.
 */
function resolveEntity(query, conversationHistory = []) {
  let domain = null;
  let email = null;
  let companyName = null;

  const q = query.toLowerCase();

  // 1. Try extracting email from current query
  const emailMatch = query.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    email = emailMatch[0];
    domain = email.split('@')[1];
  }

  // 2. Try extracting domain from current query
  if (!domain) {
    const domainMatch = q.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
    if (domainMatch && isDomain(domainMatch[1])) {
      domain = domainMatch[1].replace(/^www\./, '');
    }
  }

  // 3. Try extracting company name using heuristics from current query
  if (!domain && !email) {
    // Check patterns like "at Stripe", "for Snowflake", "about Salesforce"
    const capMatch = query.match(/(?:at|for|from|about|of|on|with)\s+([A-Z][a-zA-Z0-9\s&.-]{1,30})/);
    if (capMatch) {
      companyName = capMatch[1].trim();
    } else {
      const stripped = q
        .replace(/research|tell me about|analyze|profile|overview of|who is|what does|company|intelligence|deep.?dive|background|them|their|him|her/gi, '')
        .trim();
      companyName = stripped.replace(/\s+/g, ' ').trim() || null;
    }
  }

  // 4. Conversational History Resolution (scan newest to oldest)
  if (!domain && !email && !companyName && Array.isArray(conversationHistory)) {
    logger.info(`[ExploriumSmartRouter] No entity found in current query. Scanning history of ${conversationHistory.length} messages.`);
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      const content = msg.content || '';

      // Check for email in past turn
      const historyEmailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (historyEmailMatch) {
        email = historyEmailMatch[0];
        domain = email.split('@')[1];
        logger.info(`[ExploriumSmartRouter] Conversational memory: resolved email "${email}" from history`);
        break;
      }

      // Check for domain in past turn
      const historyDomainMatch = content.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/gi);
      if (historyDomainMatch) {
        for (const item of historyDomainMatch) {
          const cleanItem = item.replace(/https?:\/\/|www\./gi, '').trim();
          if (isDomain(cleanItem)) {
            domain = cleanItem;
            logger.info(`[ExploriumSmartRouter] Conversational memory: resolved domain "${domain}" from history`);
            break;
          }
        }
        if (domain) break;
      }
    }
  }

  return { domain, email, companyName };
}

/**
 * Resolves a company name (e.g. "Stripe", "Snowflake") into a matched domain and business ID.
 * Employs a match -> search -> autocomplete waterfall.
 */
async function resolveNameToDomain(name) {
  if (!name || isDomain(name)) return null;

  logger.info(`[ExploriumSmartRouter] Resolving company name "${name}" to domain via match/search/autocomplete waterfall`);

  // Step A: Match business directly by name
  try {
    const match = await withCache('match_business', { name }, () =>
      matchBusinessService({ name }).catch(() => null)
    );
    const busId = match?.business_id || match?.id;
    if (match?.domain && busId) {
      logger.info(`[ExploriumSmartRouter] Waterfall matched "${name}" -> "${match.domain}"`);
      return { domain: match.domain, businessId: busId };
    }
  } catch (err) {
    logger.warn(`[ExploriumSmartRouter] Waterfall matching failed for "${name}": ${err.message}`);
  }

  // Step B: Search businesses using name filter
  try {
    const search = await withCache('fetch_businesses', { filters: { company_name: { values: [name] } } }, () =>
      fetchBusinessesService({ filters: { company_name: { values: [name] } }, page_size: 1 }).catch(() => null)
    );
    const firstResult = search?.results?.[0] || search?.data?.[0];
    const busId = firstResult?.business_id || firstResult?.id;
    if (firstResult?.domain && busId) {
      logger.info(`[ExploriumSmartRouter] Waterfall searched "${name}" -> "${firstResult.domain}"`);
      return { domain: firstResult.domain, businessId: busId };
    }
  } catch (err) {
    logger.warn(`[ExploriumSmartRouter] Waterfall search failed for "${name}": ${err.message}`);
  }

  // Step C: Autocomplete resolution fallback
  try {
    const suggestions = await withCache('business_autocomplete', { field: 'company_name', query: name }, () =>
      businessAutocompleteService('company_name', name).catch(() => [])
    );
    if (suggestions && suggestions.length > 0) {
      const bestSuggest = suggestions[0];
      const matchSuggest = await withCache('match_business', { name: bestSuggest }, () =>
        matchBusinessService({ name: bestSuggest }).catch(() => null)
      );
      const busId = matchSuggest?.business_id || matchSuggest?.id;
      if (matchSuggest?.domain && busId) {
        logger.info(`[ExploriumSmartRouter] Waterfall autocompleted "${name}" via "${bestSuggest}" -> "${matchSuggest.domain}"`);
        return { domain: matchSuggest.domain, businessId: busId };
      }
    }
  } catch (err) {
    logger.warn(`[ExploriumSmartRouter] Waterfall autocomplete failed for "${name}": ${err.message}`);
  }

  return null;
}

/**
 * Resolves a single topic string to a verified Bombora intent topic using autocomplete or local mapping.
 */
async function resolveIntentTopic(topic) {
  if (!topic || typeof topic !== 'string') return topic;
  if (topic.includes(':')) return topic; // Already looks like verified taxonomy (e.g. "Security:Cybersecurity")

  const topicMap = {
    'security': 'Security:Cybersecurity',
    'cloud': 'IT:Cloud Computing',
    'crm': 'Sales:CRM Software',
    'hr': 'HR:HR Software',
    'payroll': 'HR:Payroll',
    'analytics': 'Data:Analytics',
    'marketing': 'Marketing:Marketing Automation',
    'erp': 'Operations:ERP',
    'ai': 'Technology:Artificial Intelligence',
    'data': 'Data:Data Management',
  };

  const lower = topic.toLowerCase();
  for (const [key, val] of Object.entries(topicMap)) {
    if (lower.includes(key)) {
      return val;
    }
  }

  try {
    const suggestions = await withCache('business_autocomplete', { field: 'business_intent_topics', query: topic, semantic_search: true }, () =>
      businessAutocompleteService('business_intent_topics', topic, true).catch(() => [])
    );
    if (suggestions && suggestions.length > 0) {
      logger.info(`[ExploriumSmartRouter] Resolved topic "${topic}" -> "${suggestions[0]}"`);
      return suggestions[0];
    }
  } catch (err) {
    logger.warn(`[ExploriumSmartRouter] Autocomplete error for topic "${topic}": ${err.message}`);
  }

  return topic;
}

/**
 * Extract intent topics from a query.
 */
async function extractIntentTopics(query) {
  const topicMap = {
    'security': 'Security:Cybersecurity',
    'cloud': 'IT:Cloud Computing',
    'crm': 'Sales:CRM Software',
    'hr': 'HR:HR Software',
    'payroll': 'HR:Payroll',
    'analytics': 'Data:Analytics',
    'marketing': 'Marketing:Marketing Automation',
    'erp': 'Operations:ERP',
    'ai': 'Technology:Artificial Intelligence',
    'data': 'Data:Data Management',
  };
  const q = query.toLowerCase();
  const matched = Object.entries(topicMap)
    .filter(([key]) => q.includes(key))
    .map(([, topic]) => topic);

  // If we matched 3 or more topics locally, return early
  if (matched.length >= 3) {
    return matched.slice(0, 3);
  }

  // Define stop words to ignore when extracting fallback raw keywords
  const stopWords = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
    'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom',
    'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and',
    'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
    'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should',
    'now', 'find', 'search', 'signals', 'companies', 'interested', 'intent', 'looking', 'buying',
    'signal', 'in-market', 'researching', 'growth', 'fast', 'startup', 'startups', 'leads'
  ]);

  // Try parsing descriptive B2B topic patterns
  const regexPatterns = [
    /interested\s+in\s+([a-zA-Z0-9\s-]{3,30})/i,
    /looking\s+for\s+([a-zA-Z0-9\s-]{3,30})/i,
    /intent\s+on\s+([a-zA-Z0-9\s-]{3,30})/i,
    /researching\s+([a-zA-Z0-9\s-]{3,30})/i,
    /buying\s+([a-zA-Z0-9\s-]{3,30})/i,
  ];

  const candidates = [];
  for (const pattern of regexPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const phrase = match[1].trim();
      const cleanPhrase = phrase.split(/\b(?:and|or|for|with|in|at|to)\b/i)[0].trim();
      if (cleanPhrase && cleanPhrase.length > 2) {
        candidates.push(cleanPhrase);
      }
    }
  }

  // Heuristic split fallback if no descriptive pattern was matched
  if (candidates.length === 0) {
    const words = query
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2 && !stopWords.has(w));
    candidates.push(...words.slice(0, 3));
  }

  const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 3);

  for (const candidate of uniqueCandidates) {
    if (matched.length >= 3) break;
    // Skip if matched locally already
    if (Object.keys(topicMap).some(key => candidate.includes(key) || key.includes(candidate))) {
      continue;
    }

    try {
      logger.info(`[ExploriumSmartRouter] Semantically autocompleting intent topic candidate: "${candidate}"`);
      const suggestions = await withCache('business_autocomplete', { field: 'business_intent_topics', query: candidate, semantic_search: true }, () =>
        businessAutocompleteService('business_intent_topics', candidate, true).catch(() => [])
      );

      if (suggestions && suggestions.length > 0) {
        const topSuggestion = suggestions[0];
        if (!matched.includes(topSuggestion)) {
          matched.push(topSuggestion);
          logger.info(`[ExploriumSmartRouter] Resolved semantic intent topic: "${candidate}" -> "${topSuggestion}"`);
        }
      }
    } catch (err) {
      logger.warn(`[ExploriumSmartRouter] Autocomplete error for candidate "${candidate}": ${err.message}`);
    }
  }

  return matched.slice(0, 3);
}

// ─── Data fetchers per agent ──────────────────────────────────────────────────

/**
 * Executes a fallback web search using Google Custom Search, parsing snippets
 * to fuse them under the web_fallback context key.
 */
async function executeWebFallback(searchTerm) {
  try {
    logger.info(`[ExploriumSmartRouter] Executing web fallback search for "${searchTerm}"`);
    const searchString = `${searchTerm} company overview description tech stack`;
    const searchRes = await googleSearch.func({
      query: searchString,
      tz: 'America/New_York',
      num: 5
    });

    if (!searchRes) {
      return { search_term: searchTerm, results: [] };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(searchRes);
    } catch (e) {
      return {
        search_term: searchTerm,
        results: [{ title: 'Web Search Results', snippet: searchRes, link: '' }]
      };
    }

    let items = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && Array.isArray(parsed.items)) {
      items = parsed.items;
    } else if (parsed && typeof parsed === 'object') {
      items = [parsed];
    }

    const structuredResults = items.map(item => ({
      title: item.title || item.name || '',
      link: item.link || item.url || '',
      snippet: item.snippet || item.description || ''
    }));

    return {
      search_term: searchTerm,
      results: structuredResults
    };
  } catch (err) {
    logger.error(`[ExploriumSmartRouter] Web fallback search failed: ${err.message}`);
    return {
      search_term: searchTerm,
      error: err.message,
      results: []
    };
  }
}

/**
 * Asynchronously checks if a business is enrolled for webhooks in Redis.
 * If not, triggers addBusinessEnrollmentsService in the background and writes tracking flag.
 */
async function autoEnrollBusinessForWebhooks(businessId) {
  if (!businessId) return;
  const trackingKey = `explorium:enrolled:${businessId}`;
  try {
    const isEnrolled = await RedisClient.get(trackingKey);
    if (isEnrolled) {
      return; // Already registered
    }

    logger.info(`[ExploriumSmartRouter] Business ${businessId} is not enrolled for webhooks. Triggering auto-enrollment.`);

    // Comprehensive list of event types to monitor
    const eventTypes = [
      'new_funding_round', 'ipo_announcement', 'new_product', 'new_partnership',
      'lawsuits_and_legal_issues', 'outages_and_security_breaches',
      'cost_cutting', 'closing_office', 'increase_in_all_departments', 'decrease_in_all_departments'
    ];

    // Fallback webhook endpoint
    const webhookUrl = process.env.EXPLORIUM_WEBHOOK_URL || 'http://localhost:5000/api/v1/explorium/webhook/inbound';
    const partnerId = 'alti_assistant';

    // Execute background API enrollment call without holding up the request thread
    addBusinessEnrollmentsService([businessId], eventTypes, webhookUrl, partnerId)
      .then(async (res) => {
        logger.info(`[ExploriumSmartRouter] Successfully enrolled business ${businessId} in webhooks: ${JSON.stringify(res)}`);
        // Mark as registered in Redis with a 30-day expiration (2592000 seconds)
        await RedisClient.set(trackingKey, 'true', { EX: 2592000 });
      })
      .catch((err) => {
        logger.error(`[ExploriumSmartRouter] Failed to enroll business ${businessId} in webhooks: ${err.message}`);
      });

  } catch (err) {
    logger.warn(`[ExploriumSmartRouter] Webhook enrollment check failed for ${businessId}: ${err.message}`);
  }
}

async function fetchCompanyResearchData(query, conversationHistory = []) {
  let { domain, email, companyName } = resolveEntity(query, conversationHistory);

  if (!domain && email) {
    domain = email.split('@')[1];
  }

  if (!domain && companyName) {
    const resolved = await resolveNameToDomain(companyName);
    if (resolved) {
      domain = resolved.domain;
    }
  }

  // Fallback 1: Domain could not be resolved from entity extraction
  if (!domain) {
    const searchTerm = companyName || query;
    const fallbackData = await executeWebFallback(searchTerm);
    return {
      query,
      web_fallback: fallbackData,
      note: 'No domain resolved. Fallback web search executed.'
    };
  }

  // Detect sales/outreach intent to trigger parallel contacts lookup
  const salesKeywords = [
    'sell to', 'pitch to', 'who should i contact', 'who should we contact',
    'who is in charge', 'leads at', 'leads of', 'prospects at', 'prospects of',
    'outreach to', 'outreach at', 'decision maker', 'decision-maker',
    'contact person', 'contact at', 'contact of', 'sales target', 'pitching to',
    'selling to', 'outreach strategy', 'cold email', 'outreach'
  ];
  const q = query.toLowerCase();
  const hasSalesIntent = salesKeywords.some(keyword => q.includes(keyword));

  try {
    const enrichments = [
      'firmographics',
      'technographics',
      'webstack',
      'funding_and_acquisitions',
      'workforce_trends',
      'website_traffic',
      'business_intent_topics',
      'competitive_landscape',
      'strategic_insights',
      'company_ratings'
    ];

    let intel = null;
    let contacts = null;

    if (hasSalesIntent) {
      logger.info(`[ExploriumSmartRouter] Sales/outreach intent detected for domain: ${domain}. Fetching contacts cascade in parallel.`);
      const [intelResult, contactsResult] = await Promise.all([
        withCache('competitive_landscape', { domain, types: enrichments }, () =>
          getCompanyIntelligenceService(domain, enrichments)
        ).catch(err => {
          logger.error(`[ExploriumSmartRouter] Intel fetch error: ${err.message}`);
          return { matched: false, error: err.message };
        }),
        withCache('fetch_prospects', { domain, limit: 5 }, () =>
          getDecisionMakersService(domain, ['c-suite', 'vp', 'director'], [], true, false, 5)
        ).catch(err => {
          logger.error(`[ExploriumSmartRouter] Contacts fetch error: ${err.message}`);
          return null;
        })
      ]);
      intel = intelResult;
      contacts = contactsResult;
    } else {
      intel = await withCache(
        'competitive_landscape',
        { domain, types: enrichments },
        () => getCompanyIntelligenceService(domain, enrichments).catch((err) => ({ matched: false, error: err.message }))
      );
    }

    // Fallback 2: Domain was resolved but Explorium profile match is false, empty, or failed
    if (!intel || intel.matched === false || intel.error) {
      logger.info(`[ExploriumSmartRouter] Company intel match missing or failed for ${domain}. Triggering fallback web search.`);
      const searchTerm = companyName || domain;
      const fallbackData = await executeWebFallback(searchTerm);
      return {
        domain,
        intel: intel || { matched: false },
        contacts,
        web_fallback: fallbackData,
        note: 'Explorium match missing or failed. Fallback web search executed.'
      };
    }

    const businessId = intel?.business_id;
    if (businessId) {
      // Trigger background auto-enrollment (non-blocking)
      autoEnrollBusinessForWebhooks(businessId);
    }

    // Retrieve pending webhook delta events from Redis
    let realTimeAlerts = null;
    if (businessId) {
      try {
        const key = `explorium:events:business:${businessId}`;
        const events = await RedisClient.lrange(key, 0, -1);
        if (events && events.length > 0) {
          const formattedAlerts = [];
          for (const evtStr of events) {
            try {
              const evt = JSON.parse(evtStr);
              const dateStr = evt.occurred_at ? evt.occurred_at.split('T')[0] : 'Unknown Date';
              let detail = '';
              if (evt.event_data) {
                detail = typeof evt.event_data === 'object' ? JSON.stringify(evt.event_data) : String(evt.event_data);
              }
              let emoji = '⚠️';
              if (evt.event_type?.includes('funding')) emoji = '💰';
              else if (evt.event_type?.includes('growth') || evt.event_type?.includes('product') || evt.event_type?.includes('partnership')) emoji = '🚀';
              else if (evt.event_type?.includes('hiring') || evt.event_type?.includes('employee')) emoji = '👥';

              formattedAlerts.push(`${emoji} Alert: ${evt.event_type} occurred on ${dateStr}.${detail ? ' Detail: ' + detail : ''}`);
            } catch (e) {
              // Ignore parse errors
            }
          }
          if (formattedAlerts.length > 0) {
            realTimeAlerts = `[EXPLORIUM REAL-TIME DELTA ALERTS]\n` + formattedAlerts.join('\n');
          }
        }
      } catch (err) {
        logger.warn(`[ExploriumSmartRouter] Failed to retrieve real-time alerts for business ${businessId}: ${err.message}`);
      }
    }

    return {
      real_time_alerts: realTimeAlerts,
      domain,
      intel,
      contacts,
      web_fallback: null
    };
  } catch (err) {
    logger.error('[ExploriumSmartRouter] Company research error:', err.message);

    // Fallback 3: API or network error thrown in fetch pipeline
    logger.info(`[ExploriumSmartRouter] Fetch pipeline threw error for ${domain}. Triggering fallback web search.`);
    const searchTerm = companyName || domain;
    const fallbackData = await executeWebFallback(searchTerm);
    return {
      domain,
      error: err.message,
      web_fallback: fallbackData,
      note: 'Fetch pipeline error. Fallback web search executed.'
    };
  }
}

async function fetchProspectHunterData(query, conversationHistory = []) {
  let { domain, email, companyName } = resolveEntity(query, conversationHistory);

  if (!domain && email) {
    domain = email.split('@')[1];
  }

  let businessId = null;

  if (domain) {
    const match = await withCache('match_business', { domain }, () =>
      matchBusinessService({ domain }).catch(() => null)
    );
    businessId = match?.id || match?.business_id;
  } else if (companyName) {
    const resolved = await resolveNameToDomain(companyName);
    if (resolved) {
      domain = resolved.domain;
      businessId = resolved.businessId;
    }
  }

  const q = query.toLowerCase();

  // Determine seniority/department filters from query
  const departmentMap = {
    'cto': { job_titles: ['CTO', 'Chief Technology Officer', 'VP Engineering', 'Head of Engineering'] },
    'ceo': { job_titles: ['CEO', 'Chief Executive Officer', 'Founder', 'Co-Founder'] },
    'cmo': { job_titles: ['CMO', 'Chief Marketing Officer', 'VP Marketing', 'Head of Marketing'] },
    'cfo': { job_titles: ['CFO', 'Chief Financial Officer', 'VP Finance', 'Head of Finance'] },
    'vp': { job_levels: ['vp'] },
    'director': { job_levels: ['director'] },
    'engineer': { job_departments: ['engineering'] },
    'sales': { job_departments: ['sales'] },
    'marketing': { job_departments: ['marketing'] },
    'hr': { job_departments: ['human_resources'] },
    'finance': { job_departments: ['finance'] },
    'product': { job_departments: ['product'] },
  };

  let filters = { job_levels: ['c_suite', 'vp', 'director'] }; // Default: senior
  for (const [keyword, f] of Object.entries(departmentMap)) {
    if (q.includes(keyword)) {
      filters = { ...filters, ...f };
      break;
    }
  }

  try {
    const prospects = await withCache('fetch_prospects', { businessId, filters, limit: 10 }, () =>
      fetchProspectsService({
        filters: businessId ? { business_id: { values: [businessId] }, ...filters } : filters,
        size: 10,
        page_size: 10
      }).catch(() => ({ results: [] }))
    );
    return { company: domain || companyName, business_id: businessId, prospects };
  } catch (err) {
    logger.error('[ExploriumSmartRouter] Prospect hunter error:', err.message);
    return { company: domain || companyName, error: err.message };
  }
}

async function fetchSignalScoutData(query, conversationHistory = []) {
  let { domain, email, companyName } = resolveEntity(query, conversationHistory);

  if (!domain && email) {
    domain = email.split('@')[1];
  }

  let businessId = null;

  if (domain) {
    const match = await withCache('match_business', { domain }, () =>
      matchBusinessService({ domain }).catch(() => null)
    );
    businessId = match?.id || match?.business_id;
  } else if (companyName) {
    const resolved = await resolveNameToDomain(companyName);
    if (resolved) {
      domain = resolved.domain;
      businessId = resolved.businessId;
    }
  }

  const q = query.toLowerCase();

  const isFunding = ['fund', 'raised', 'invest', 'series', 'round', 'capital'].some(k => q.includes(k));
  const isHiring  = ['hire', 'hiring', 'headcount', 'job post', 'recruit', 'growing team'].some(k => q.includes(k));
  const isIntent  = ['intent', 'looking for', 'buying signal', 'in-market', 'researching'].some(k => q.includes(k));

  const topics = await extractIntentTopics(query);
  const results = {};

  try {
    if (businessId) {
      logger.info(`[ExploriumSmartRouter] Signal Scout targeting company "${domain}" with businessId "${businessId}"`);
      // Fetch targeted signals in parallel
      const [events, intent, workforce] = await Promise.allSettled([
        withCache('business_events', { businessId, lastDays: 30 }, () =>
          fetchBusinessEventsService(businessId, [], 30).catch(() => null)
        ),
        withCache('business_intent_topics', { businessId }, () =>
          enrichBusinessSingleService(businessId, 'business_intent_topics').catch(() => null)
        ),
        withCache('workforce_trends', { businessId }, () =>
          enrichBusinessSingleService(businessId, 'workforce_trends').catch(() => null)
        ),
      ]);

      results.company_events = events.status === 'fulfilled' ? events.value : { error: events.reason?.message };
      results.company_intent = intent.status === 'fulfilled' ? intent.value : { error: intent.reason?.message };
      results.company_workforce = workforce.status === 'fulfilled' ? workforce.value : { error: workforce.reason?.message };

      return { domain, business_id: businessId, targeted_signals: results };
    } else {
      // Global radars fallback
      // Funding signals
      if (isFunding || (!isHiring && !isIntent)) {
        results.funding = await withCache('business_events', { type: 'funding', days: 30 }, () =>
          getFundingRadarService({}, 30, 30).catch(() => null)
        );
      }

      // Hiring signals
      if (isHiring) {
        results.hiring = await withCache('business_events', { type: 'hiring', days: 30 }, () =>
          getHiringSignalsService(['engineering', 'sales'], {}, 30, 30).catch(() => null)
        );
      }

      // Intent signals
      if (isIntent && topics.length > 0) {
        results.intent = await withCache('business_intent_topics', { topics }, () =>
          getIntentSignalsService(topics, 'high_intent', {}, 20).catch(() => null)
        );
      }

      return { signals: results, topics };
    }
  } catch (err) {
    logger.error('[ExploriumSmartRouter] Signal scout error:', err.message);
    return { error: err.message };
  }
}

async function fetchICPBuilderData(query, conversationHistory = []) {
  try {
    const icpResult = await buildICP(query);

    // Clean unverified LLM intent filter topics using the semantic autocomplete resolver
    if (icpResult?.filters?.business_intent_topics) {
      const topicFilter = icpResult.filters.business_intent_topics;
      const originalTopics = topicFilter.topics || topicFilter.values;
      if (Array.isArray(originalTopics)) {
        const resolvedValues = [];
        for (const topic of originalTopics) {
          const resolved = await resolveIntentTopic(topic);
          resolvedValues.push(resolved);
        }
        if (topicFilter.topics) {
          topicFilter.topics = resolvedValues;
        } else {
          topicFilter.values = resolvedValues;
        }
        logger.info(`[ExploriumSmartRouter] ICP business_intent_topics filters dynamically updated/resolved:`, resolvedValues);
      }
    }

    // Get a sample of actual companies matching the ICP
    let sampleCompanies = [];
    if (icpResult.filters && Object.keys(icpResult.filters).length > 0) {
      const sample = await fetchBusinessesService({
        filters: icpResult.filters,
        page_size: 15,
        size: 15,
        mode: 'full'
      }).catch(() => null);
      sampleCompanies = sample?.results || sample?.data || [];
    }

    // Get live count
    const stats = await businessStatisticsService(icpResult.filters || {}).catch(() => null);

    return {
      original_query: query,
      icp: icpResult,
      live_count: stats?.count ?? stats?.total_results ?? icpResult.estimated_count,
      sample_companies: sampleCompanies,
    };
  } catch (err) {
    logger.error('[ExploriumSmartRouter] ICP builder error:', err.message);
    return { error: err.message };
  }
}

async function fetchSalesCoachData(query, conversationHistory = []) {
  let { domain, email, companyName } = resolveEntity(query, conversationHistory);

  if (email) {
    try {
      const brief = await analyzeProspect(email, query);
      return { email, brief };
    } catch (err) {
      logger.error('[ExploriumSmartRouter] Sales coach (email) error:', err.message);
      return { email, error: err.message };
    }
  }

  // No email — try domain-based lookup
  if (!domain && companyName) {
    const resolved = await resolveNameToDomain(companyName);
    if (resolved) {
      domain = resolved.domain;
    }
  }

  if (domain) {
    try {
      const match = await withCache('match_business', { domain }, () =>
        matchBusinessService({ domain }).catch(() => null)
      );
      const businessId = match?.id || match?.business_id;
      const prospects = businessId
        ? await fetchProspectsService({
            filters: {
              business_id: { values: [businessId] },
              job_level: { values: ['c_suite', 'vp'] }
            },
            size: 5,
            page_size: 5
          }).catch(() => null)
        : null;
      return { domain, business_id: businessId, prospects, note: 'No email provided — showing top prospects for prep.' };
    } catch (err) {
      return { domain, error: err.message };
    }
  }

  return { error: 'Could not extract email, domain or company name from query or conversation history for sales prep.' };
}

async function fetchLeadScorerData(query, conversationHistory = []) {
  // Try to extract multiple company names/domains from the query
  const lines = query.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
  
  // Resolve domains/company names for each line
  const resolvedTargets = [];
  for (const line of lines.slice(0, 10)) { // Max 10
    let { domain, companyName } = resolveEntity(line, []);
    if (domain) {
      resolvedTargets.push({ domain });
    } else if (companyName) {
      resolvedTargets.push({ companyName });
    }
  }

  if (resolvedTargets.length === 0) {
    const sample = await naturalLanguageSearch(query, 10).catch(() => null);
    return { companies: [], sample_results: sample };
  }

  // Resolve all companyNames to domains in parallel to minimize waterfall latency
  const resolvedDomains = await Promise.all(
    resolvedTargets.map(async (target) => {
      if (target.domain) return target.domain;
      const resolved = await resolveNameToDomain(target.companyName);
      return resolved?.domain || null;
    })
  );

  const activeDomains = Array.from(new Set(resolvedDomains.filter(Boolean)));
  if (activeDomains.length === 0) {
    return { companies: [] };
  }

  // Batch match all resolved domains to get business_ids in a single cached call
  const matchParamsList = activeDomains.map(domain => ({ domain }));
  const matchResults = await withCacheBatch(
    'match_business',
    matchParamsList,
    async (missed) => {
      logger.info(`[ExploriumSmartRouter] Batch matching ${missed.length} domains`);
      const apiRes = await matchBusinessesService(missed).catch(() => null);
      const apiResults = apiRes?.results || [];
      return missed.map((item, idx) => apiResults[idx] || null);
    }
  );

  // Filter matched businesses with a valid businessId
  const matchedBusinesses = [];
  const enrichParamsList = [];

  for (let i = 0; i < activeDomains.length; i++) {
    const domain = activeDomains[i];
    const match = matchResults[i];
    const businessId = match?.id || match?.business_id;
    if (businessId) {
      matchedBusinesses.push({ domain, businessId });
      enrichParamsList.push({ businessId });
    }
  }

  if (enrichParamsList.length === 0) {
    return { companies: [] };
  }

  // Batch enrich firmographics for all matched businesses in a single cached call
  const enrichResults = await withCacheBatch(
    'firmographics',
    enrichParamsList,
    async (missed) => {
      const missedIds = missed.map(p => p.businessId);
      logger.info(`[ExploriumSmartRouter] Batch enriching ${missedIds.length} businesses for firmographics`);
      const apiRes = await bulkEnrichBusinessesService(missedIds, 'firmographics').catch(() => null);
      const apiResults = apiRes?.results || [];
      
      const resultMap = {};
      for (const item of apiResults) {
        const id = item?.business_id || item?.id;
        if (id) resultMap[id] = item;
      }
      return missed.map(p => resultMap[p.businessId] || null);
    }
  );

  // Assemble final company payloads
  const companies = [];
  for (let i = 0; i < matchedBusinesses.length; i++) {
    const { domain, businessId } = matchedBusinesses[i];
    const data = enrichResults[i];
    companies.push({ domain, business_id: businessId, data });
  }

  return { companies };
}

async function fetchOutreachWriterData(query, conversationHistory = []) {
  let { domain, email, companyName } = resolveEntity(query, conversationHistory);

  if (!domain && email) {
    domain = email.split('@')[1];
  }

  if (!domain && companyName) {
    const resolved = await resolveNameToDomain(companyName);
    if (resolved) {
      domain = resolved.domain;
    }
  }

  const result = {};

  if (email) {
    const prospectData = await analyzeProspect(email, '').catch(() => null);
    result.prospect = prospectData;
  }

  if (domain) {
    const companyData = await withCache(
      'firmographics',
      { domain },
      () => researchCompany(domain, 'Summarize this company for a cold outreach context.').catch(() => null)
    );
    result.company = companyData;
  }

  return result;
}

async function fetchMarketMapperData(query, conversationHistory = []) {
  try {
    let { domain, companyName } = resolveEntity(query, conversationHistory);

    if (!domain && companyName) {
      const resolved = await resolveNameToDomain(companyName);
      if (resolved) {
        domain = resolved.domain;
      }
    }

    const q = query.toLowerCase();

    // Extract industry/keyword from query
    const keywordPatterns = [
      /players in (?:the )?([a-zA-Z\s]{3,30})(?:space|market|industry|sector)?/i,
      /(?:companies like|similar to|competitors (?:of|to)) ([a-zA-Z0-9\s.]{3,30})/i,
      /(?:market|landscape|overview) (?:of|for) (?:the )?([a-zA-Z\s]{3,30})/i,
    ];
    let keyword = '';
    for (const p of keywordPatterns) {
      const m = query.match(p);
      if (m) { keyword = m[1].trim(); break; }
    }
    if (!keyword && domain) keyword = domain;

    const results = {};

    if (keyword) {
      results.keyword_search = await withCache('keyword_search', { keyword, limit: 20 }, () =>
        getCompanyIntelligenceService(keyword, ['firmographics', 'competitive_landscape']).catch(() => null)
      );
    }

    if (domain) {
      // Match company first to get business_id for lookalike
      const match = await withCache('match_business', { domain }, () =>
        matchBusinessService({ domain }).catch(() => null)
      );
      const businessId = match?.id || match?.business_id;
      if (businessId) {
        results.lookalikes = await withCache('lookalike_companies', { businessId }, () =>
          getLookalikeCompaniesService(domain, {}).catch(() => null)
        );
      }
    }

    return { query, domain, keyword, market_data: results };
  } catch (err) {
    logger.error('[ExploriumSmartRouter] Market mapper error:', err.message);
    return { error: err.message };
  }
}

// ─── Agent ID → Data fetcher map ─────────────────────────────────────────────

const EXPLORIUM_AGENT_FETCHERS = {
  explorium_company_researcher: fetchCompanyResearchData,
  explorium_prospect_hunter:    fetchProspectHunterData,
  explorium_signal_scout:       fetchSignalScoutData,
  explorium_icp_builder:        fetchICPBuilderData,
  explorium_sales_coach:        fetchSalesCoachData,
  explorium_lead_scorer:        fetchLeadScorerData,
  explorium_outreach_writer:    fetchOutreachWriterData,
  explorium_market_mapper:      fetchMarketMapperData,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the given agent ID is an Explorium agent.
 */
export function isExploriumAgent(agentId) {
  return agentId in EXPLORIUM_AGENT_FETCHERS;
}

/**
 * Pre-fetches live Explorium data for the matched agent and returns
 * a context string to inject into the LLM prompt.
 *
 * @param {string} agentId   - The matched Explorium agent ID
 * @param {string} query     - The original user query
 * @returns {Promise<string>} - Formatted data context for injection
 */
export async function getExploriumContext(agentId, query, conversationHistory = []) {
  const fetcher = EXPLORIUM_AGENT_FETCHERS[agentId];
  if (!fetcher) return '';

  logger.info(`[ExploriumSmartRouter] Fetching context for agent: ${agentId}`);

  try {
    const data = await fetcher(query, conversationHistory);

    if (!data || data.error) {
      logger.warn(`[ExploriumSmartRouter] No data for ${agentId}: ${data?.error}`);
      return `\n\n[EXPLORIUM DATA]: No data available — ${data?.error || 'unknown error'}. Respond based on general knowledge and note the data limitation.\n`;
    }

    const contextStr = JSON.stringify(data, null, 2);
    // Cap context at 14,000 chars to stay within token limits
    const truncated = contextStr.length > 14000
      ? contextStr.slice(0, 14000) + '\n... [truncated for context window]'
      : contextStr;

    return `\n\n[EXPLORIUM LIVE DATA — ${new Date().toISOString()}]:\n\`\`\`json\n${truncated}\n\`\`\`\n\nAnalyze the above live Explorium data to answer the user's query. Reference specific data points. Do not invent data not present in the context.\n`;
  } catch (err) {
    logger.error(`[ExploriumSmartRouter] Context fetch failed for ${agentId}:`, err.message);
    return `\n\n[EXPLORIUM DATA]: Data fetch failed (${err.message}). Answer based on general knowledge and note the limitation.\n`;
  }
}
