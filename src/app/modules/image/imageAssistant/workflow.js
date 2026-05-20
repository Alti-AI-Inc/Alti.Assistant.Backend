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

let checkpointer;
try {
  checkpointer = await MongoDBSaver.fromUri(config.database_local, 'image_checkpoints');
} catch (err) {
  console.warn('⚠️ Image assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  checkpointer = new MemorySaver();
}
export const app = workflow.compile({ checkpointer });
