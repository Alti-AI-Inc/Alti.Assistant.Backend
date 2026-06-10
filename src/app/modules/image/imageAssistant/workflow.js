/**
 * @file Defines the workflow for the Image Assistant using Langchain's StateGraph.
 * This workflow orchestrates the steps involved in processing user requests for image generation,
 * including analyzing prompts, asking clarifying questions, confirming details, and finally generating the image.
 *
 * The workflow supports both new conversations and continuing ones, leveraging a checkpointer
 * to maintain state across turns. It initially uses an in-memory checkpointer and
 * attempts to upgrade to a MongoDB-based checkpointer for persistent state management.
 */
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

/**
 * Initializes the state machine for the Image Assistant workflow.
 * The `StateGraph` defines the structure and transitions of the conversational flow.
 *
 * @type {StateGraph<import('./state.js').GraphState>}
 * @property {object} channels - The schema for the state channels, defining what data is passed between nodes.
 */
const workflow = new StateGraph({
  channels: graphState,
});

// Add nodes to the graph
/**
 * Adds the 'analyze_prompt' node to the workflow.
 * This node is responsible for the initial analysis of a new user prompt.
 */
workflow.addNode('analyze_prompt', analyzeInitialPromptNode);
/**
 * Adds the 'process_response' node to the workflow.
 * This node processes subsequent user responses in an ongoing conversation.
 */
workflow.addNode('process_response', processUserResponseNode);
/**
 * Adds the 'ask_question' node to the workflow.
 * This node generates and sends a clarifying question to the user.
 */
workflow.addNode('ask_question', askQuestionNode);
/**
 * Adds the 'get_confirmation' node to the workflow.
 * This node asks the user for confirmation on gathered details before proceeding.
 */
workflow.addNode('get_confirmation', getConfirmationNode);
/**
 * Adds the 'compile_prompt' node to the workflow.
 * This node compiles all gathered information into a final prompt suitable for image generation.
 */
workflow.addNode('compile_prompt', compileFinalPromptNode);
/**
 * Adds the 'generate_image' node to the workflow.
 * This node triggers the actual image generation process based on the compiled prompt.
 */
workflow.addNode('generate_image', generateImageNode);

// Define the workflow edges

/**
 * Defines the entry point of the workflow.
 * Conditionally routes the conversation based on whether it's a new interaction or a continuing one.
 * - If new, it goes to 'analyze_prompt'.
 * - If continuing, it goes to 'process_response'.
 * @param {string} START - The starting point of the graph.
 * @param {function} routeInitial - A routing function that determines the next node based on the initial state.
 * @param {object} routes - An object mapping route names to node names.
 */
workflow.addConditionalEdges(START, routeInitial, {
  analyze_prompt: 'analyze_prompt',
  process_response: 'process_response',
});

/**
 * Defines the edge for a new conversation path.
 * After the initial prompt is analyzed, the turn ends, typically waiting for user input.
 * @param {string} 'analyze_prompt' - The source node.
 * @param {string} END - The end point of the current turn.
 */
workflow.addEdge('analyze_prompt', END);

/**
 * Defines the conditional routing after processing a user's response in a continuing conversation.
 * Determines the next action based on the processed response:
 * - 'ask_question': If more information is needed.
 * - 'get_confirmation': If details need to be confirmed.
 * - 'compile_prompt': If enough information is gathered to proceed to image generation.
 * @param {string} 'process_response' - The source node.
 * @param {function} routeNextStep - A routing function that determines the next node based on the processed response.
 * @param {object} routes - An object mapping route names to node names.
 */
workflow.addConditionalEdges('process_response', routeNextStep, {
  ask_question: 'ask_question',
  get_confirmation: 'get_confirmation',
  compile_prompt: 'compile_prompt',
});

/**
 * Defines the edge for ending a turn after asking a question.
 * The workflow waits for the user's response.
 * @param {string} 'ask_question' - The source node.
 * @param {string} END - The end point of the current turn.
 */
workflow.addEdge('ask_question', END);
/**
 * Defines the edge for ending a turn after asking for confirmation.
 * The workflow waits for the user's response.
 * @param {string} 'get_confirmation' - The source node.
 * @param {string} END - The end point of the current turn.
 */
workflow.addEdge('get_confirmation', END);

/**
 * Defines the edge for proceeding from prompt compilation to image generation.
 * Once the final prompt is ready, the image generation process is initiated.
 * @param {string} 'compile_prompt' - The source node.
 * @param {string} 'generate_image' - The destination node.
 */
workflow.addEdge('compile_prompt', 'generate_image');

/**
 * Defines the edge for ending the workflow after image generation.
 * Once the image is generated, the conversation turn is considered complete.
 * @param {string} 'generate_image' - The source node.
 * @param {string} END - The end point of the current turn.
 */
workflow.addEdge('generate_image', END);

/**
 * Initializes an in-memory checkpointer.
 * This is used immediately to compile the workflow, ensuring the application can start
 * without waiting for a database connection.
 * @type {MemorySaver | MongoDBSaver}
 */
let checkpointer = new MemorySaver();

/**
 * The compiled Langchain workflow application instance.
 * This is the primary export used to interact with the image assistant workflow.
 * It is initially compiled with an in-memory checkpointer and later updated
 * with a MongoDB checkpointer if the connection is successful.
 *
 * @type {import('@langchain/langgraph').CompiledStateGraph<import('./state.js').GraphState>}
 */
export let app = workflow.compile({ checkpointer });

/**
 * Attempts to connect to MongoDB to establish a persistent checkpointer.
 * This operation is deferred and non-blocking, allowing the application to start
 * with the in-memory checkpointer. If successful, the `app` instance is recompiled
 * with the MongoDB checkpointer for persistent state management.
 *
 * @async
 * @function
 * @param {string} config.database_local - The MongoDB connection URI.
 * @param {string} 'image_checkpoints' - The collection name for storing workflow checkpoints.
 * @returns {Promise<void>} A promise that resolves when the MongoDB checkpointer is connected
 *   and the workflow is recompiled, or rejects if the connection fails.
 */
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