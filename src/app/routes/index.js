import express from 'express';
import { authRoutes } from '../modules/auth/auth.route.js';
import { deepseekAiRoutes } from '../modules/deepseek/deepseek.route.js';
import { geminiAiRoutes } from '../modules/gemini/gemini.route.js';
import { llamaAiRoutes } from '../modules/groq/groq.route.js';
import { subscriptionRoutes } from '../modules/payment/payment.route.js';
import newSubscriptionRoutes from '../modules/subscription/subscription.routes.js';
import { tavilyAiRoutes } from '../modules/tavily/tavily.route.js';
import { qwenAiRoutes } from '../modules/qwen/qwen.route.js';
import { aiModelEndpointRoutes } from '../modules/aiModelServices/aiEndpoint.route.js';
import { openAIAiRoutes } from '../modules/openAi/openAi.route.js';
import { wishperAiRoutes } from '../modules/wishper/wishper.route.js';
import { adminRoutes } from '../modules/admin/admin.route.js';
import { llama4AiRoutes } from '../modules/Llama4/llama4.route.js';
import { notificationRoutes } from '../modules/notification/notification.route.js';
import { socialLoginRotes } from '../modules/social-login/social-login.route.js';
import { supportRoutes } from '../modules/support/support.route.js';
import { composioRoutes } from '../modules/composio/composio.route.js';
import { browserUseAiRoutes } from '../modules/browserUse/browserUse.route.js';
import { cyberdeskRoutes } from '../modules/cyberdesk/cyberdesk.route.js';
import { llamaindexRoutes } from '../modules/llamaindex/llamaindex.route.js';
import { codeRoutes } from '../modules/code/code.route.js';
import { writingRoutes } from '../modules/writing/workflow.route.js';
import { summaryRoutes } from '../modules/summary/summary.route.js';
import { searchRoute } from '../modules/search/search.route.js';
import { conversationRoutes } from '../modules/conversations/conversation.route.js';
import { imageRoutes } from '../modules/image/image.route.js';
import { videoRoutes } from '../modules/video/video.route.js';
import { deepResearchRoute } from '../modules/deep_research/deep_research.route.js';
import { composioV2Routes } from '../modules/composio_v2/composio.route.js';
import { composioSimpleRoutes } from '../modules/composio_simple/composio.route.js';
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
import { tenantRoutes } from '../modules/tenant/tenant.route.js';
import { massiveRoutes } from '../modules/massive/massive.route.js';
import { orchestratorRoutes } from '../modules/orchestrator/orchestrator.route.js';
import { SwarmRoutes } from '../modules/swarm/swarm.route.js';

const router = express.Router();

const moduleRoutes = [
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
    path: '/groq',
    route: llamaAiRoutes,
  },
  {
    path: '/tavily',
    route: tavilyAiRoutes,
  },
  {
    path: '/gemini',
    route: geminiAiRoutes,
  },
  {
    path: '/llama4',
    route: llama4AiRoutes,
  },
  {
    path: '/deepseek',
    route: deepseekAiRoutes,
  },
  // {
  //   path: '/serper',
  //   route: serperAiRoutes,
  // },
  {
    path: '/qwen',
    route: qwenAiRoutes,
  },
  {
    path: '/wishper',
    route: wishperAiRoutes,
  },
  {
    path: '/openai',
    route: openAIAiRoutes,
  },
  {
    path: '/api-endpoint',
    route: aiModelEndpointRoutes,
  },
  {
    path: '/composio',
    route: composioRoutes,
  },
  {
    path: '/composio_v2',
    route: composioV2Routes,
  },
  {
    path: '/composio-simple',
    route: composioSimpleRoutes,
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
    route: codeRoutes,
  },
  {
    path: '/writing',
    route: writingRoutes,
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
    path: '/deep-research',
    route: deepResearchRoute,
  },
  {
    path: '/conversations',
    route: conversationRoutes,
  },
  {
    path: '/image',
    route: imageRoutes,
  },
  {
    path: '/video',
    route: videoRoutes,
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
    path: '/gcp-native',
    route: gcpNativeRoutes,
  },
];

moduleRoutes.forEach((route) => {
  console.log(`Registering route: ${route.path}`);

  return router.use(route.path, route.route);
});

export default router;
