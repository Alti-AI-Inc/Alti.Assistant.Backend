/**
 * @file This file defines the state machine workflow for the video generation assistant
 * using LangChain's StateGraph. It orchestrates various nodes to analyze user prompts,
 * interact with the user, compile final video generation instructions, and trigger video creation.
 *
 * The workflow supports both new conversations and continuing ones, managing state persistence
 * initially with an in-memory saver and then upgrading to a MongoDB-based saver for
 * persistent session management.
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { videoGeneratorState } from './state.js';
import {
  analyzeInitialVideoPromptNode,
  processVideoUserResponseNode,
  askVideoQuestionNode,
  getVideoConfirmationNode,
  compileVideoFinalPromptNode,
  generateVideoNode,
  routeVideoInitial,
  routeVideoNextStep,
} from './nodes.js';
import config from '../../../../../config/index.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';

/**
 * Initializes the video generation state machine using LangGraph's StateGraph.
 * This graph defines the states and transitions for the video assistant's conversation flow.
 *
 * @type {StateGraph<import('./state.js').VideoGeneratorState>}
 * @property {import('./state.js').VideoGeneratorState} channels - The schema defining the state channels for the graph.
 */
const videoWorkflow = new StateGraph({
  channels: videoGeneratorState,
});

// Add nodes to the graph
/**
 * Adds a node to the workflow responsible for analyzing the initial video prompt.
 * @see {@link analyzeInitialVideoPromptNode}
 */
videoWorkflow.addNode('analyze_video_prompt', analyzeInitialVideoPromptNode);
/**
 * Adds a node to the workflow responsible for processing the user's response in a continuing conversation.
 * @see {@link processVideoUserResponseNode}
 */
videoWorkflow.addNode('process_video_response', processVideoUserResponseNode);
/**
 * Adds a node to the workflow responsible for asking a clarifying question to the user.
 * @see {@link askVideoQuestionNode}
 */
videoWorkflow.addNode('ask_video_question', askVideoQuestionNode);
/**
 * Adds a node to the workflow responsible for getting confirmation from the user.
 * @see {@link getVideoConfirmationNode}
 */
videoWorkflow.addNode('get_video_confirmation', getVideoConfirmationNode);
/**
 * Adds a node to the workflow responsible for compiling the final prompt for video generation.
 * @see {@link compileVideoFinalPromptNode}
 */
videoWorkflow.addNode('compile_video_prompt', compileVideoFinalPromptNode);
/**
 * Adds a node to the workflow responsible for triggering the actual video generation process.
 * @see {@link generateVideoNode}
 */
videoWorkflow.addNode('generate_video', generateVideoNode);

// Define the workflow edges

/**
 * Defines the entry point of the workflow.
 *
 * 1. ENTRY POINT: Decides if it's a new conversation or a continuing one based on the input.
 *    - If new, routes to 'analyze_video_prompt'.
 *    - If continuing, routes to 'process_video_response'.
 * @see {@link routeVideoInitial}
 */
videoWorkflow.addConditionalEdges(START, routeVideoInitial, {
  analyze_video_prompt: 'analyze_video_prompt',
  process_video_response: 'process_video_response',
});

/**
 * Defines the edge for a new conversation path.
 * 2. Path for a new conversation: After analyzing the initial prompt, the turn ends.
 */
videoWorkflow.addEdge('analyze_video_prompt', END); // End the turn after asking the first question.

/**
 * Defines the conditional edges for a continuing conversation.
 *
 * 3. Path for a continuing conversation: First process the user's message.
 * 4. ROUTER: After processing, decides what to do next based on the processed response.
 *    - If a question needs to be asked, routes to 'ask_video_question'.
 *    - If confirmation is needed, routes to 'get_video_confirmation'.
 *    - If the prompt is ready for compilation, routes to 'compile_video_prompt'.
 * @see {@link routeVideoNextStep}
 */
videoWorkflow.addConditionalEdges(
  'process_video_response',
  routeVideoNextStep,
  {
    ask_video_question: 'ask_video_question',
    get_video_confirmation: 'get_video_confirmation',
    compile_video_prompt: 'compile_video_prompt',
  }
);

/**
 * Defines the edges for states that end the current turn.
 *
 * 5. End the turn after asking a question or asking for confirmation.
 */
videoWorkflow.addEdge('ask_video_question', END);
videoWorkflow.addEdge('get_video_confirmation', END);

/**
 * Defines the edge from prompt compilation to video generation.
 *
 * 6. If compiling, proceed to generate the video.
 */
videoWorkflow.addEdge('compile_video_prompt', 'generate_video');

/**
 * Defines the final edge after video generation.
 *
 * 7. After generating the video, the conversation is finished for now.
 */
videoWorkflow.addEdge('generate_video', END);

/**
 * Initializes an in-memory checkpointer for the workflow.
 * This is used initially to avoid blocking startup while waiting for a database connection.
 * @type {MemorySaver}
 */
let videoCheckpointer = new MemorySaver();

/**
 * The compiled video generation application.
 * This is the runnable instance of the StateGraph, ready to be invoked.
 * It is initially compiled with an in-memory checkpointer.
 *
 * @type {import('@langchain/langgraph').CompiledStateGraph<import('./state.js').VideoGeneratorState>}
 */
export const videoApp = videoWorkflow.compile({ checkpointer: videoCheckpointer });

/**
 * Attempts to upgrade the workflow's checkpointer to use MongoDB for persistent state saving.
 * This operation is deferred and non-blocking, allowing the application to start immediately
 * with an in-memory fallback.
 *
 * If successful, the `videoApp` is recompiled with the MongoDB checkpointer.
 * If it fails, a warning is logged, and the in-memory checkpointer remains active.
 */
MongoDBSaver.fromUri(config.database_local, 'video_checkpoints')
  .then((mongoCheckpointer) => {
    videoCheckpointer = mongoCheckpointer;
    // Recompile the application with the MongoDB checkpointer
    Object.assign(videoApp, videoWorkflow.compile({ checkpointer: videoCheckpointer }));
    console.log('✅ Video assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ Video assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  });