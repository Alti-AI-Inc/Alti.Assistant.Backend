/**
 * explorium.webhook.handler.js — Real-Time Inbound Event Processor
 *
 * Receives and dispatches webhook events from Explorium AgentSource.
 * Verifies HMAC-SHA256 signatures, invalidates relevant cache entries,
 * publishes to Redis pub/sub for real-time UI streaming, and logs all events.
 *
 * Mount at: POST /api/v1/explorium/webhook/inbound
 * Uses express.raw() so raw body is available for signature verification.
 *
 * ─── Event Categories ──────────────────────────────────────────────────
 *   funding  : new_funding_round, new_investment, ipo_announcement
 *   growth   : new_product, new_office, new_partnership, company_award, award
 *   risk     : lawsuits_and_legal_issues, outages_and_security_breaches,
 *              cost_cutting, closing_office, merger_and_acquisitions
 *   hiring   : hiring_in_*_department, increase_in_*_department, employee_joined_company
 *   prospect : recently_changed_company, employee_job_changes, employee_workplace_anniversary
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import { invalidateCache } from './explorium.cache.js';

// ─── Event Category Sets ──────────────────────────────────────────────────────

const FUNDING_EVENTS = new Set([
  'new_funding_round', 'new_investment', 'ipo_announcement',
]);

const GROWTH_EVENTS = new Set([
  'new_product', 'new_office', 'new_partnership', 'company_award', 'award',
]);

const RISK_EVENTS = new Set([
  'lawsuits_and_legal_issues', 'outages_and_security_breaches',
  'cost_cutting', 'closing_office', 'merger_and_acquisitions',
]);

const HIRING_EVENTS = new Set([
  'hiring_in_engineering_department', 'hiring_in_sales_department',
  'hiring_in_marketing_department', 'hiring_in_finance_department',
  'hiring_in_human_resources_department', 'hiring_in_operations_department',
  'hiring_in_support_department', 'hiring_in_legal_department',
  'hiring_in_creative_department', 'hiring_in_health_department',
  'hiring_in_education_department', 'hiring_in_professional_service_department',
  'hiring_in_trade_department', 'hiring_in_unknown_department',
  'increase_in_all_departments', 'decrease_in_all_departments',
  'increase_in_engineering_department', 'decrease_in_engineering_department',
  'increase_in_sales_department', 'decrease_in_sales_department',
  'increase_in_marketing_department', 'decrease_in_marketing_department',
  'increase_in_operations_department', 'decrease_in_operations_department',
  'increase_in_customer_service_department', 'decrease_in_customer_service_department',
  'employee_joined_company',
]);

const PROSPECT_EVENTS = new Set([
  'recently_changed_company', 'employee_job_changes', 'employee_workplace_anniversary',
]);

function classifyEvent(eventType) {
  if (FUNDING_EVENTS.has(eventType)) return 'funding';
  if (GROWTH_EVENTS.has(eventType))  return 'growth';
  if (RISK_EVENTS.has(eventType))    return 'risk';
  if (HIRING_EVENTS.has(eventType))  return 'hiring';
  if (PROSPECT_EVENTS.has(eventType)) return 'prospect_change';
  return 'general';
}

// ─── HMAC Signature Verification ─────────────────────────────────────────────

/**
 * Verify Explorium's HMAC-SHA256 webhook signature using constant-time comparison.
 *
 * @param {string|Buffer} rawBody   - Raw request body
 * @param {string}        signature - X-Explorium-Signature header value
 * @param {string}        secret    - Webhook secret from registration
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) return true; // No secret configured = skip verification
  if (!signature) return false;

  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    // Support both bare hex and "sha256=<hex>" prefix
    const sigHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(sigHex, 'hex');

    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function publish(channel, payload) {
  try {
    await RedisClient.publish(channel, JSON.stringify(payload));
  } catch { /* Redis pub/sub is optional */ }
}

async function storeBusinessEventInRedis(businessId, event) {
  if (!businessId) return;
  const key = `explorium:events:business:${businessId}`;
  try {
    const payload = {
      event_type: event.event_type,
      event_data: event.event_data || null,
      occurred_at: event.occurred_at || new Date().toISOString(),
      prospect_id: event.prospect_id || null,
      received_at: new Date().toISOString(),
    };
    await RedisClient.lpush(key, JSON.stringify(payload));
    await RedisClient.ltrim(key, 0, 49);
    await RedisClient.expire(key, 2592000); // 30 days
  } catch (err) {
    logger.warn(`[Explorium Webhook] Failed to store event in Redis: ${err.message}`);
  }
}

async function handleFundingEvent(event) {
  const { business_id, event_type, event_data, occurred_at } = event;
  logger.info(`[Explorium Webhook] 💰 FUNDING: ${event_type} → business ${business_id}`);

  // Invalidate stale cached data so next request pulls fresh from Explorium
  await Promise.allSettled([
    invalidateCache('funding_and_acquisitions', { businessId: business_id }),
    invalidateCache('firmographics',            { businessId: business_id }),
    invalidateCache('financial_metrics',        { businessId: business_id }),
    invalidateCache('competitive_landscape',    { businessId: business_id }),
  ]);

  await storeBusinessEventInRedis(business_id, event);

  await publish('explorium:events:funding', {
    business_id, event_type, event_data, occurred_at, category: 'funding',
  });
}

async function handleGrowthEvent(event) {
  const { business_id, event_type, occurred_at } = event;
  logger.info(`[Explorium Webhook] 🚀 GROWTH: ${event_type} → business ${business_id}`);

  await Promise.allSettled([
    invalidateCache('competitive_landscape', { businessId: business_id }),
    invalidateCache('strategic_insights',   { businessId: business_id }),
  ]);

  await storeBusinessEventInRedis(business_id, event);

  await publish('explorium:events:growth', { business_id, event_type, occurred_at, category: 'growth' });
}

async function handleRiskEvent(event) {
  const { business_id, event_type, event_data, occurred_at } = event;
  logger.warn(`[Explorium Webhook] ⚠️  RISK: ${event_type} → business ${business_id}`);

  await Promise.allSettled([
    invalidateCache('business_challenges',  { businessId: business_id }),
    invalidateCache('competitive_landscape', { businessId: business_id }),
  ]);

  await storeBusinessEventInRedis(business_id, event);

  await publish('explorium:events:risk', {
    business_id, event_type, event_data, occurred_at, category: 'risk',
  });
}

async function handleHiringEvent(event) {
  const { business_id, event_type, occurred_at } = event;
  logger.info(`[Explorium Webhook] 👥 HIRING: ${event_type} → business ${business_id}`);

  await Promise.allSettled([
    invalidateCache('workforce_trends', { businessId: business_id }),
  ]);

  await storeBusinessEventInRedis(business_id, event);

  await publish('explorium:events:hiring', { business_id, event_type, occurred_at, category: 'hiring' });
}

async function handleProspectEvent(event) {
  const { prospect_id, business_id, event_type, event_data, occurred_at } = event;
  logger.info(`[Explorium Webhook] 👤 PROSPECT: ${event_type} → prospect ${prospect_id}`);

  await Promise.allSettled([
    prospect_id && invalidateCache('professional_profile', { prospectId: prospect_id }),
    prospect_id && invalidateCache('contacts_information',  { prospectId: prospect_id }),
  ].filter(Boolean));

  await storeBusinessEventInRedis(business_id, event);

  await publish('explorium:events:prospects', {
    prospect_id, business_id, event_type, event_data, occurred_at, category: 'prospect_change',
  });
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

/**
 * Process a single Explorium event object.
 * Called for each event in a batch webhook payload.
 *
 * @param {object} event
 */
export async function processWebhookEvent(event) {
  if (!event || !event.event_type) {
    logger.warn('[Explorium Webhook] Received event without event_type');
    return;
  }

  const category = classifyEvent(event.event_type);

  switch (category) {
    case 'funding':         return handleFundingEvent(event);
    case 'growth':          return handleGrowthEvent(event);
    case 'risk':            return handleRiskEvent(event);
    case 'hiring':          return handleHiringEvent(event);
    case 'prospect_change': return handleProspectEvent(event);
    default:
      logger.info(`[Explorium Webhook] General event: ${event.event_type}`);
      await publish('explorium:events:general', { ...event, category: 'general' });
  }
}

// ─── Express Middleware ───────────────────────────────────────────────────────

/**
 * Express route handler for POST /explorium/webhook/inbound
 *
 * IMPORTANT: This must be mounted with express.raw() BEFORE express.json()
 * so the raw body is available for HMAC verification:
 *
 *   router.post('/webhook/inbound', express.raw({ type: '*\/*' }), webhookHandler);
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export async function webhookHandler(req, res) {
  const rawBody  = req.body;  // Buffer (thanks to express.raw)
  const signature = req.headers['x-explorium-signature'] || req.headers['x-hub-signature-256'] || '';
  const secret   = (process.env.EXPLORIUM_WEBHOOK_SECRET || '').trim();

  // 1. Verify HMAC signature
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn('[Explorium Webhook] Signature verification failed — request rejected');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  // 2. Parse JSON payload
  let payload;
  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    payload = JSON.parse(bodyStr);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // 3. Acknowledge immediately (Explorium requires <5s response)
  res.status(200).json({ received: true, timestamp: new Date().toISOString() });

  // 4. Process events asynchronously (don't block the HTTP response)
  const events = Array.isArray(payload) ? payload : [payload];
  setImmediate(async () => {
    logger.info(`[Explorium Webhook] Processing ${events.length} event(s)`);
    for (const event of events) {
      try {
        await processWebhookEvent(event);
      } catch (err) {
        logger.error(`[Explorium Webhook] Handler error for "${event?.event_type}": ${err.message}`);
      }
    }
  });
}

export const ExploriumWebhook = {
  webhookHandler,
  verifyWebhookSignature,
  processWebhookEvent,
};
