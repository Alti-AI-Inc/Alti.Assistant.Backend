/**
 * @file Defines the LangGraph workflow for the writing assistant module.
 * This workflow orchestrates the steps involved in generating content using AI,
 * including state management and persistence.
 */

import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import config from '../../../../../config/index.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';
import * as nodes from './nodes.js';
import { writingAssistantState } from './state.js';

/**
 * @typedef {import('@langchain/langgraph').StateGraph} StateGraph
 * @typedef {import('@langchain/langgraph').CompiledStateGraph} CompiledStateGraph
 * @typedef {import('@langchain/langgraph').BaseCheckpointSaver} BaseCheckpointSaver
 */

/**
 * Initializes a new StateGraph for the writing assistant.
 * The `channels` are set to `writingAssistantState` to manage the data flow between nodes.
 * @type {StateGraph}
 */
const workflow = new StateGraph({ channels: writingAssistantState });

// --- Nodes ---
// NOTE: Previously only 'write_content' was wired in, so every request (even the
// very first message of a brand new conversation) skipped straight to final content
// generation. The clarifying-question flow below (analyze_topic -> process_response
// -> ask_question/get_confirmation) was fully implemented in nodes.js/tests but was
// never connected to the graph. Re-enabling it here so the assistant actually asks
// clarifying questions and builds a brief before writing, which produces much better,
// more targeted final output.
workflow.addNode('analyze_topic', nodes.analyzeTopicNode);
workflow.addNode('process_response', nodes.processResponseNode);
workflow.addNode('ask_question', nodes.askQuestionNode);
workflow.addNode('get_confirmation', nodes.getConfirmationNode);
workflow.addNode('write_content', nodes.writeContentNode);

// --- Edges ---

/**
 * Entry point routing: brand new conversations (empty history) go through topic
 * analysis first; conversations already in progress go to process_response.
 */
workflow.addConditionalEdges(START, nodes.routeInitial, {
  analyze_topic: 'analyze_topic',
  process_response: 'process_response',
});

// After asking the initial clarifying questions, pause and wait for the user's reply.
workflow.addEdge('analyze_topic', END);

/**
 * After the brief is updated with the user's latest answer, decide whether to:
 *  - ask another clarifying question,
 *  - ask for final confirmation before writing, or
 *  - the user has indicated they're finished, so go straight to writing.
 */
workflow.addConditionalEdges('process_response', nodes.routeNextStep, {
  ask_question: 'ask_question',
  get_confirmation: 'get_confirmation',
  write_content: 'write_content',
});

workflow.addEdge('ask_question', END);
workflow.addEdge('get_confirmation', END);
workflow.addEdge('write_content', END);

/**
 * Initializes the checkpointer for the LangGraph workflow.
 * Initially, an in-memory checkpointer is used to avoid blocking startup.
 * @type {BaseCheckpointSaver}
 */
let checkpointer = new MemorySaver();

/**
 * The compiled LangGraph application for the writing assistant.
 * @type {CompiledStateGraph}
 */
export const writingAssistantApp = workflow.compile({ checkpointer });

/**
 * Asynchronously upgrades the workflow's checkpointer to use MongoDB for persistent
 * state management. Deferred to avoid blocking application startup.
 */
MongoDBSaver.fromUri(config.database_local, 'writer_checkpoints')
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    Object.assign(writingAssistantApp, workflow.compile({ checkpointer }));
    console.log('✅ Writing assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn(
      '⚠️ Writing assistant: MongoDB checkpointer unavailable, using in-memory fallback:',
      err.message
    );
  });
