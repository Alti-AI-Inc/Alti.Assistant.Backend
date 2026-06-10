/**
 * @file Defines the LangGraph workflow for the writing assistant module.
 * This workflow orchestrates the steps involved in generating content using AI,
 * including state management and persistence.
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { writingAssistantState } from './state.js';
import config from '../../../../../config/index.js';
import * as nodes from './nodes.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';

/**
 * @typedef {import('@langchain/langgraph').StateGraph} StateGraph
 * @typedef {import('@langchain/langgraph').CompiledStateGraph} CompiledStateGraph
 * @typedef {import('@langchain/langgraph').BaseCheckpointSaver} BaseCheckpointSaver
 */

/**
 * Initializes a new StateGraph for the writing assistant.
 * This graph defines the states and transitions for the content generation process.
 * The `channels` are set to `writingAssistantState` to manage the data flow between nodes.
 * @type {StateGraph}
 */
const workflow = new StateGraph({ channels: writingAssistantState });

// workflow.addNode("analyze_topic", nodes.analyzeTopicNode);
// workflow.addNode("process_response", nodes.processResponseNode);
// workflow.addNode("ask_question", nodes.askQuestionNode);
// workflow.addNode("get_confirmation", nodes.getConfirmationNode);
/**
 * Adds the 'write_content' node to the workflow.
 * This node is responsible for the core content generation logic.
 */
workflow.addNode('write_content', nodes.writeContentNode);

/**
 * Defines the initial edge of the workflow, starting from `START` and leading to the 'write_content' node.
 */
workflow.addEdge(START, 'write_content');
// workflow.addEdge("analyze_topic", END);
// workflow.addConditionalEdges("process_response", nodes.routeNextStep, {
//   ask_question: "ask_question",
//   get_confirmation: "get_confirmation",
//   write_content: "write_content",
// });
// workflow.addEdge("ask_question", END);
// workflow.addEdge("get_confirmation", END);
/**
 * Defines the final edge of the workflow, leading from the 'write_content' node to `END`.
 */
workflow.addEdge('write_content', END);

/**
 * Initializes the checkpointer for the LangGraph workflow.
 * Initially, an in-memory checkpointer is used to avoid blocking startup.
 * This allows the application to be immediately functional while a persistent checkpointer is being set up.
 * @type {BaseCheckpointSaver}
 */
let checkpointer = new MemorySaver();

/**
 * The compiled LangGraph application for the writing assistant.
 * This is the executable instance of the workflow, ready to be invoked.
 * It is initially compiled with an in-memory checkpointer.
 * @type {CompiledStateGraph}
 */
export const writingAssistantApp = workflow.compile({ checkpointer });

/**
 * Asynchronously upgrades the workflow's checkpointer to use MongoDB for persistent state management.
 * This operation is deferred to avoid blocking the application's startup.
 * If the MongoDB connection is successful, the `writingAssistantApp` is recompiled with the new checkpointer.
 * In case of failure, a warning is logged, and the application continues to use the in-memory fallback.
 *
 * @async
 * @function
 * @param {string} config.database_local - The MongoDB connection URI.
 * @param {string} 'writer_checkpoints' - The name of the collection to store checkpoints in MongoDB.
 * @returns {Promise<void>} A promise that resolves when the checkpointer is updated or rejects on error.
 */
MongoDBSaver.fromUri(config.database_local, 'writer_checkpoints')
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    // Recompile the app with the MongoDB checkpointer
    Object.assign(writingAssistantApp, workflow.compile({ checkpointer }));
    console.log('✅ Writing assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ Writing assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  });