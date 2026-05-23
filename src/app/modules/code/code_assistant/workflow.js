import { StateGraph, END, MemorySaver, START } from '@langchain/langgraph';
import { codeAssistantState } from './state.js';
import {
  detectIntentNode,
  routeOnIntent,
  generateCodeNode,
  explainCodeNode,
  debugCodeNode,
  bestPracticesNode,
  generalConversationNode,
} from './nodes.js';
import { MongoDBSaver } from './MongoDBSaver.js';
import config from '../../../../../config/index.js';

// Initialize the state machine
const workflow = new StateGraph({
  channels: codeAssistantState,
});

// Add nodes to the graph
workflow.addNode('detect_intent', detectIntentNode);
workflow.addNode('generate_code', generateCodeNode);
workflow.addNode('explain_code', explainCodeNode);
workflow.addNode('debug_code', debugCodeNode);
workflow.addNode('best_practices', bestPracticesNode);
workflow.addNode('general_conversation', generalConversationNode);

// Define the workflow edges

// 1. Entry point is to always detect the intent of the user's message.
workflow.addEdge(START, 'detect_intent');

// 2. Based on the intent, route to the appropriate task node.
workflow.addConditionalEdges('detect_intent', routeOnIntent, {
  generate_code: 'generate_code',
  explain_code: 'explain_code',
  debug_code: 'debug_code',
  best_practices: 'best_practices',
  general_conversation: 'general_conversation',
});

// 3. After any task is performed, the conversation turn ends.
workflow.addEdge('generate_code', END);
workflow.addEdge('explain_code', END);
workflow.addEdge('debug_code', END);
workflow.addEdge('best_practices', END);
workflow.addEdge('general_conversation', END);

// Compile immediately with in-memory checkpointer to avoid blocking startup.
// MongoDB checkpointer is initialized lazily on first request.
let checkpointer = new MemorySaver();
export const codeAssistantApp = workflow.compile({ checkpointer });

// Deferred MongoDB checkpointer upgrade (non-blocking)
MongoDBSaver.fromUri(config.database_local)
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    // Re-compile with persistent checkpointer
    Object.assign(codeAssistantApp, workflow.compile({ checkpointer }));
    console.log('✅ Code assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ Code assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  });

