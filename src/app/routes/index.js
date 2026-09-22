import express from 'express';
import { authRoutes } from '../modules/auth/auth.route.js';
import { DeepResearchRoutes } from '../modules/ExaDeepResearch/exaDeepResearch.route.js';
import { ResearchRoutes } from '../modules/ExaResearch/exaResearch.route.js';

// import { subscriptionRoutes } from '../modules/payment/payment.route.js';
import newSubscriptionRoutes from '../modules/subscription/subscription.routes.js';

import { adminRoutes } from '../modules/admin/admin.route.js';
import { notificationRoutes } from '../modules/notification/notification.route.js';
import { socialLoginRotes } from '../modules/social-login/social-login.route.js';
import { supportRoutes } from '../modules/support/support.route.js';

import { stripeRoutes } from '../modules/stripe/stripe.route.js';
import { tenantRoutes } from '../modules/tenant/tenant.route.js';

import { chatAiRoutes } from '../modules/chat/chat.route.js';
import { MonitorRoutes } from '../modules/ExaMonitor/monitor.route.js';
import { SpaceRoutes } from '../modules/Space/space.route.js';
import { usageRoutes } from '../modules/usage/usage.route.js';
import { ComposioRoutes } from '../modules/composio/composio.route.js';
import { SearchRoutes } from '../modules/ExaSearch/exa.search.route.js';
import { ContentRoutes } from '../modules/ExaContents/contents.route.js';
import { LibertyRoutes } from '../modules/liberty/liberty.route.js';
import { GroqRoutes } from '../modules/groq/groq.route.js';
import { CloudflareRoutes } from '../modules/cloudflare/cloudflare.route.js';
import { CodexRoutes } from '../modules/codex/codex.route.js';
import { OpenClawRoutes } from '../modules/openclaw/openclaw.route.js';
import { TemporalRoutes } from '../modules/temporal/temporal.route.js';
import { LangChainRoutes } from '../modules/langchain/langchain.route.js';
import { OrchestratorRoutes } from '../modules/orchestrator/orchestrator.route.js';
import { EvaluatorRoutes } from '../modules/evaluator/evaluator.route.js';
import { PromptForgeRoutes } from '../modules/promptforge/promptforge.route.js';
import { RagRoutes } from '../modules/rag/rag.route.js';
import { AgentRoutes } from '../modules/agents/agents.route.js';
import { WorkflowRoutes } from '../modules/workflows/workflows.route.js';
import { TriggerRoutes } from '../modules/triggers/triggers.route.js';
import { TemplateRoutes } from '../modules/templates/templates.route.js';
import { TraceRoutes } from '../modules/traces/traces.route.js';
import { invoiceRoutes } from '../modules/invoice/invoice.route.js';
import { LlamaIndexRoutes } from '../modules/llamaindex/llamaindex.route.js';
import { ResearchWebhookRoutes } from '../modules/ExaResearch/exaResearch.webhook.route.js';
import { MonitorWebhookRoutes } from '../modules/ExaMonitor/monitor.webhook.route.js';
import { realEstateApiRoutes } from '../modules/realestateapi/realestateapi.route.js';
import { fredRoutes } from '../modules/fred/fred.route.js';
import { arxivRoutes } from '../modules/arxiv/arxiv.route.js';
import { congressRoutes } from '../modules/congress/congress.route.js';
import { openfdaRoutes } from '../modules/openfda/openfda.route.js';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/tenant',
    route: tenantRoutes,
  },
  {
    path: '/realestateapi',
    route: realEstateApiRoutes,
  },
  {
    path: '/fred',
    route: fredRoutes,
  },
  {
    path: '/arxiv',
    route: arxivRoutes,
  },
  {
    path: '/congress',
    route: congressRoutes,
  },
  {
    path: '/openfda',
    route: openfdaRoutes,
  },
  {
    path: '/admin',
    route: adminRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/auth-social',
    route: socialLoginRotes,
  },
  {
    path: '/support',
    route: supportRoutes,
  },
  {
    path: '/subscriptions',
    route: newSubscriptionRoutes,
  },
  {
    path: '/notification',
    route: notificationRoutes,
  },
  {
    path: '/stripe',
    route: stripeRoutes,
  },
  {
    path: '/usage',
    route: usageRoutes,
  },
  {
    path: '/spaces',
    route: SpaceRoutes,
  },
  {
    path: '/monitors',
    route: MonitorRoutes,
  },
  {
    path: '/researches',
    route: ResearchRoutes,
  },
  {
    path: '/deep-research',
    route: DeepResearchRoutes,
  },
  {
    path: '/chat',
    route: chatAiRoutes,
  },
  {
    path: '/composio',
    route: ComposioRoutes,
  },
  {
    path: '/search',
    route: SearchRoutes,
  },
  {
    path: '/contents',
    route: ContentRoutes,
  },
  {
    path: '/liberty',
    route: LibertyRoutes,
  },
  {
    path: '/groq',
    route: GroqRoutes,
  },
  {
    path: '/cloudflare',
    route: CloudflareRoutes,
  },
  {
    path: '/codex',
    route: CodexRoutes,
  },
  {
    path: '/openclaw',
    route: OpenClawRoutes,
  },
  {
    path: '/temporal',
    route: TemporalRoutes,
  },
  {
    path: '/langchain',
    route: LangChainRoutes,
  },
  {
    path: '/orchestrator',
    route: OrchestratorRoutes,
  },
  {
    path: '/evaluator',
    route: EvaluatorRoutes,
  },
  {
    path: '/promptforge',
    route: PromptForgeRoutes,
  },
  {
    path: '/rag',
    route: RagRoutes,
  },
  {
    path: '/agents',
    route: AgentRoutes,
  },
  {
    path: '/workflows',
    route: WorkflowRoutes,
  },
  {
    path: '/triggers',
    route: TriggerRoutes,
  },
  {
    path: '/templates',
    route: TemplateRoutes,
  },
  {
    path: '/traces',
    route: TraceRoutes,
  },
  {
    path: '/invoices',
    route: invoiceRoutes,
  },
  {
    path: '/llamaindex',
    route: LlamaIndexRoutes,
  },
  {
    path: '/webhooks/exa-research',
    route: ResearchWebhookRoutes,
  },
  {
    path: '/webhooks/exa-monitors',
    route: MonitorWebhookRoutes,
  },
  {
    path: '/massive',
    route: (await import('../modules/massive/massive.route.js')).default,
  },
  {
    path: '/newsapi',
    route: (await import('../modules/newsapi/newsapi.route.js')).default,
  },
  {
    path: '/sports',
    route: (await import('../modules/apisports/apisports.route.js')).default,
  },
  {
    path: '/predictions',
    route: (await import('../modules/predictiondata/predictiondata.route.js')).default,
  },
  {
    path: '/coinapi',
    route: (await import('../modules/coinapi/coinapi.route.js')).default,
  },
  {
    path: '/mapbox',
    route: (await import('../modules/mapbox/mapbox.route.js')).default,
  },
  {
    path: '/explorium',
    route: (await import('../modules/explorium/explorium.route.js')).default,
  },
  {
    path: '/weather',
    route: (await import('../modules/visualcrossing/visualcrossing.route.js')).default,
  },
  {
    path: '/aviation',
    route: (await import('../modules/aviationstack/aviationstack.route.js')).default,
  },
];

for (const route of moduleRoutes) {
  router.use(route.path, route.route);
}

// ── Universal Sovereign Prompt Endpoints (One Prompt Box Engine) ───────────
const sovereignController = (await import('../modules/orchestrator/sovereignRouter.controller.js')).default;
router.post('/gemini/4nano/get-response', sovereignController.routePrompt);
router.post('/prompt', sovereignController.routePrompt);

router.get('/logos/:app_name', (req, res) => {
  const appName = req.params.app_name || '';
  const cleanName = appName.replace(/[^a-zA-Z0-9]/g, '');
  const initial = cleanName.charAt(0).toUpperCase() || 'A';

  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = appName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#3B82F6',
    '#EF4444',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#14B8A6',
    '#6366F1',
    '#84CC16',
  ];
  const color = colors[Math.abs(hash) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" rx="24" fill="${color}"/>
    <text x="50" y="62" font-family="system-ui, -apple-system, sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// ── API Discovery Endpoint ────────────────────────────────────────────────
// Frontend calls this to discover all available modules and their base paths.
router.get('/api-map', (req, res) => {
  const map = moduleRoutes.map(r => ({
    module: r.path.replace('/', ''),
    basePath: `/api/v1${r.path}`,
  }));

  res.json({
    success: true,
    message: 'API module map',
    data: {
      version: 'v1',
      baseUrl: '/api/v1',
      modules: map,
      health: {
        health: '/health',
        liveness: '/liveness',
        readiness: '/readiness',
      },
      billing: {
        plans: '/api/v1/subscriptions/plans',
        mySubscription: '/api/v1/subscriptions/my-subscription',
        promptUsage: '/api/v1/subscriptions/prompt-usage',
        upgrade: '/api/v1/subscriptions/upgrade',
        billingPortal: '/api/v1/subscriptions/billing-portal',
      },
      promptHeaders: [
        'X-Prompt-Used',
        'X-Prompt-Limit',
        'X-Prompt-Remaining',
        'X-Prompt-Plan',
      ],
    },
  });
});

export default router;

