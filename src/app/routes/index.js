import express from 'express';
import { authRoutes } from '../modules/auth/auth.route.js';
import { deepseekAiRoutes } from '../modules/deepseek/deepseek.route.js';
import { geminiAiRoutes } from '../modules/gemini/gemini.route.js';
import { llamaAiRoutes } from '../modules/groq/groq.route.js';
import { subscriptionRoutes } from '../modules/payment/payment.route.js';
import { tavilyAiRoutes } from '../modules/tavily/tavily.route.js';
import { togetherAiRoutes } from '../modules/togetherAi/togeterAi.route.js';
// import { serperAiRoutes } from '../modules/serper/serper.route.js';
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

const router = express.Router();

const moduleRoutes = [
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
    path: '/notification',
    route: notificationRoutes,
  },
  {
    path: '/groq',
    route: llamaAiRoutes,
  },
  {
    path: '/img-generation',
    route: togetherAiRoutes,
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
    route: writingRoutes
  },
  {
    path: '/summary',
    route: summaryRoutes
  },
  {
    path: '/search',
    route: searchRoute
  },
  {
    path: '/conversations',
    route: conversationRoutes
  }
];

moduleRoutes.forEach(route => {
  console.log(`Registering route: ${route.path}`);
  
  return router.use(route.path, route.route);
});

export default router;
