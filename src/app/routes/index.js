import express from 'express';
import { logger } from '../../shared/logger.js';
import { authRoutes } from '../modules/auth/auth.route.js';
import { geminiAiRoutes } from '../modules/gemini/gemini.route.js';

import { subscriptionRoutes } from '../modules/payment/payment.route.js';
import newSubscriptionRoutes from '../modules/subscription/subscription.routes.js';
import { googleSearchRoutes } from '../modules/google_search/google-search.route.js';
import { qwenAiRoutes } from '../modules/qwen/qwen.route.js';
import { aiModelEndpointRoutes } from '../modules/aiModelServices/aiEndpoint.route.js';

import { wishperAiRoutes } from '../modules/wishper/wishper.route.js';
import { adminRoutes } from '../modules/admin/admin.route.js';
import { llama4AiRoutes } from '../modules/Llama4/llama4.route.js';
import { notificationRoutes } from '../modules/notification/notification.route.js';
import { socialLoginRotes } from '../modules/social-login/social-login.route.js';
import { supportRoutes } from '../modules/support/support.route.js';

import { browserUseAiRoutes } from '../modules/browserUse/browserUse.route.js';
import { cyberdeskRoutes } from '../modules/cyberdesk/cyberdesk.route.js';
import { llamaindexRoutes } from '../modules/llamaindex/llamaindex.route.js';
import { codeRoutes } from '../modules/code/code.route.js';
import { writingRoutes } from '../modules/writing/workflow.route.js';
import { summaryRoutes } from '../modules/summary/summary.route.js';
import { searchRoute } from '../modules/search/search.route.js';
import { conversationRoutes } from '../modules/conversations/conversation.route.js';
import { imageRoutes } from '../modules/image/image.route.js';
import { audioRoutes } from '../modules/audio/audio.route.js';
import { videoRoutes } from '../modules/video/video.route.js';
import { deepResearchRoute } from '../modules/deep_research/deep_research.route.js';
import { createAgentProxy } from './agentProxy.js';

import { workflowAutomationRoutes } from '../modules/workflow_automation/workflowAutomation.route.js';
import knowledgebaseRoutes from '../modules/knowledgebase/knowledgebase.routes.js';
import { stripeRoutes } from '../modules/stripe/stripe.route.js';
import knowledgeBankRoutes from '../modules/knowledge_bank/knowledge_bank.routes.js';
import { enhancedImageRoute } from '../modules/enhanced_image/enhanced_image.route.js';
import { TranscriptionRoutes } from '../modules/transcription/transcription.route.js';
import presentationRoutes from '../modules/presentation/presentation.route.js';
import reportRoutes from '../modules/report/report.route.js';
import documentRoutes from '../modules/document_drafting/document.route.js';
import { documentReviewRoutes } from '../modules/document_review/document_review.route.js';
import translationRoutes from '../modules/translation/translation.route.js';
import { rewriteRoutes } from '../modules/rewrite/rewrite.route.js';
import { brainstormRoutes } from '../modules/brainstorm/brainstorm.route.js';
import { planGeneratorRoutes } from '../modules/plan_generator/plan_generator.route.js';
import { documentAnalysisRoutes } from '../modules/document_analysis/document_analysis.route.js';
import { articleWriterRoutes } from '../modules/article_writer/article_writer.route.js';
import { legalContractRoutes } from '../modules/legal_contract/legal_contract.route.js';
import { legalContractReviewRoutes } from '../modules/legal_contract_review/legal_contract_review.route.js';
import { creativeWritingRoutes } from '../modules/creative_writing/creative_writing.route.js';
import { knowledgeRoutes } from '../modules/knowledge/knowledge.route.js';
import { knowledgeCatalogRoutes } from '../modules/knowledge_catalog/knowledge_catalog.route.js';
import { tenantRoutes } from '../modules/tenant/tenant.route.js';
import { massiveRoutes } from '../modules/massive/massive.route.js';
import { predictionDataRoutes } from '../modules/predictiondata/predictiondata.route.js';
import { exploriumRoutes } from '../modules/explorium/explorium.route.js';
import { orchestratorRoutes } from '../modules/orchestrator/orchestrator.route.js';
import { SwarmRoutes } from '../modules/swarm/swarm.route.js';
import { gcpNativeRoutes } from '../modules/gcp_native/gcp-native.route.js';
import { aviationStackRoutes } from '../modules/aviationstack/aviationstack.route.js';
import { datasetsRoutes } from '../modules/datasets/datasets.route.js';
import { langchainRoutes } from '../modules/langchain/langchain.route.js';

import { temporalRoutes } from '../modules/temporal/temporal.route.js';
import { mcpToolboxRoutes } from '../modules/mcp_toolbox/mcp_toolbox.route.js';
import { dockerRoutes } from './docker.route.js';
import { chatbotRoutes } from '../modules/chatbots/chatbot.routes.js';
import { usageRoutes } from '../modules/usage/usage.route.js';
import { vertexRoutes } from '../modules/vertex/vertex.route.js';
import { cronRoutes } from '../cron/cron.route.js';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/cron',
    route: cronRoutes,
  },
  {
    path: '/datasets',
    route: datasetsRoutes,
  },
  {
    path: '/aviationstack',
    route: aviationStackRoutes,
  },
  {
    path: '/swarm',
    route: SwarmRoutes,
  },
  {
    path: '/orchestrator',
    route: orchestratorRoutes,
  },
  {
    path: '/massive',
    route: massiveRoutes,
  },
  {
    path: '/predictiondata',
    route: predictionDataRoutes,
  },
  {
    path: '/explorium',
    route: exploriumRoutes,
  },
  {
    path: '/tenant',
    route: tenantRoutes,
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
    path: '/subscription',
    route: subscriptionRoutes,
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
    path: '/google-search',
    route: googleSearchRoutes,
  },
  {
    path: '/gemini',
    route: geminiAiRoutes,
  },
  {
    path: '/vertex',
    route: vertexRoutes,
  },
  {
    path: '/llama4',
    route: llama4AiRoutes,
  },
  {
    path: '/deepseek',
    route: geminiAiRoutes,
  },
  {
    path: '/qwen',
    route: qwenAiRoutes,
  },
  {
    path: '/wishper',
    route: wishperAiRoutes,
  },
  {
    path: '/api-endpoint',
    route: aiModelEndpointRoutes,
  },
  {
    path: '/workflow-automation',
    route: workflowAutomationRoutes,
  },
  {
    path: '/cyberdesk',
    route: cyberdeskRoutes,
  },
  {
    path: '/rag-system',
    route: llamaindexRoutes,
  },
  {
    path: '/browser-use',
    route: browserUseAiRoutes,
  },
  {
    path: '/code',
    route: createAgentProxy('agent-code', 8081),
  },
  {
    path: '/writing',
    route: createAgentProxy('agent-write', 8082),
  },
  {
    path: '/summary',
    route: summaryRoutes,
  },
  {
    path: '/search',
    route: searchRoute,
  },
  {
    path: '/agent-search',
    route: createAgentProxy('agent-search', 8083),
  },
  {
    path: '/deep-research',
    route: createAgentProxy('agent-research', 8084),
  },
  {
    path: '/conversations',
    route: conversationRoutes,
  },
  {
    path: '/image',
    route: createAgentProxy('agent-image', 8085),
  },
  {
    path: '/audio',
    route: createAgentProxy('agent-audio', 8086),
  },
  {
    path: '/video',
    route: createAgentProxy('agent-video', 8087),
  },
  {
    path: '/knowledgebase',
    route: knowledgebaseRoutes,
  },
  {
    path: '/knowledge-bank',
    route: knowledgeBankRoutes,
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
    path: '/enhanced-image',
    route: enhancedImageRoute,
  },
  {
    path: '/transcription',
    route: TranscriptionRoutes,
  },
  {
    path: '/presentation',
    route: presentationRoutes,
  },
  {
    path: '/reports',
    route: reportRoutes,
  },
  {
    path: '/documents',
    route: documentRoutes,
  },
  {
    path: '/document-review',
    route: documentReviewRoutes,
  },
  {
    path: '/brainstorm',
    route: brainstormRoutes,
  },
  {
    path: '/translation',
    route: translationRoutes,
  },
  {
    path: '/rewrite',
    route: rewriteRoutes,
  },
  {
    path: '/plan-generator',
    route: planGeneratorRoutes,
  },
  {
    path: '/document-analysis',
    route: documentAnalysisRoutes,
  },
  {
    path: '/article-writer',
    route: articleWriterRoutes,
  },
  {
    path: '/legal-contract',
    route: legalContractRoutes,
  },
  {
    path: '/legal-contract-review',
    route: legalContractReviewRoutes,
  },
  {
    path: '/creative-writing',
    route: creativeWritingRoutes,
  },
  {
    path: '/knowledge',
    route: knowledgeRoutes,
  },
  {
    path: '/knowledge-catalog',
    route: knowledgeCatalogRoutes,
  },
  {
    path: '/gcp-native',
    route: gcpNativeRoutes,
  },
  {
    path: '/langchain',
    route: langchainRoutes,
  },

  {
    path: '/temporal',
    route: temporalRoutes,
  },
  {
    path: '/docker',
    route: dockerRoutes,
  },
  {
    path: '/mcp-toolbox',
    route: mcpToolboxRoutes,
  },
  {
    path: '/mcp_toolbox',
    route: mcpToolboxRoutes,
  },
  {
    path: '/chatbots',
    route: chatbotRoutes,
  },
];

moduleRoutes.forEach((route) => {
  logger.info(`Registering route: ${route.path}`);

  return router.use(route.path, route.route);
});

export default router;
