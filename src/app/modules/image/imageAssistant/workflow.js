import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { graphState } from './state.js';
import {
  analyzeInitialPromptNode,
  processUserResponseNode,
  askQuestionNode,
  getConfirmationNode,
  compileFinalPromptNode,
  generateImageNode,
  routeInitial,
  routeNextStep,
} from './nodes.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';
import config from '../../../../../config/index.js';

// Initialize the state machine
const workflow = new StateGraph({
  channels: graphState,
});

// Add nodes to the graph
workflow.addNode('analyze_prompt', analyzeInitialPromptNode);
workflow.addNode('process_response', processUserResponseNode);
workflow.addNode('ask_question', askQuestionNode);
workflow.addNode('get_confirmation', getConfirmationNode);
workflow.addNode('compile_prompt', compileFinalPromptNode);
workflow.addNode('generate_image', generateImageNode);

// Define the workflow edges

// 1. ENTRY POINT: Decide if it's a new conversation or a continuing one.
workflow.addConditionalEdges(START, routeInitial, {
  analyze_prompt: 'analyze_prompt',
  process_response: 'process_response',
});

// 2. Path for a new conversation.
workflow.addEdge('analyze_prompt', END); // End the turn after asking the first question.

// 3. Path for a continuing conversation: first process the user's message.
// workflow.addEdge("process_response", "router_next_step");

// 4. ROUTER: After processing, decide what to do next.
workflow.addConditionalEdges('process_response', routeNextStep, {
  ask_question: 'ask_question',
  get_confirmation: 'get_confirmation',
  compile_prompt: 'compile_prompt',
});

// 5. End the turn after asking a question or asking for confirmation.
workflow.addEdge('ask_question', END);
workflow.addEdge('get_confirmation', END);

// 6. If compiling, proceed to generate the image.
workflow.addEdge('compile_prompt', 'generate_image');

// 7. After generating the image, the conversation is finished for now.
workflow.addEdge('generate_image', END);

// Compile immediately with in-memory checkpointer to avoid blocking startup
let checkpointer = new MemorySaver();
// The 'app' variable needs to be mutable ('let') to allow reassignment when the MongoDB checkpointer is ready.
// Using 'const' here would prevent the 'app' object from being replaced with the MongoDB-configured version.
export let app = workflow.compile({ checkpointer });

// Deferred MongoDB checkpointer upgrade (non-blocking)
MongoDBSaver.fromUri(config.database_local, 'image_checkpoints')
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    // Recompile the workflow with the new MongoDB checkpointer and reassign it to 'app'.
    // This ensures that subsequent calls to 'app' will use the MongoDB checkpointer.
    // Note: Due to ES module import caching, modules that have already imported 'app'
    // before this reassignment might still hold a reference to the initial 'MemorySaver' version.
    // For a truly dynamic update across all consumers, a getter function or a promise
    // resolving with the final 'app' instance would be a more robust pattern.
    app = workflow.compile({ checkpointer });
    console.log('✅ Image assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ Image assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
    // If MongoDB connection fails, 'app' remains the MemorySaver version, which is the desired fallback.
  });