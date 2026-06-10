/**
 * @file This module defines the core workflow for an enhanced conversational search agent
 * using LangChain's StateGraph. It orchestrates a tool-based search process to
 * intelligently retrieve and process information based on user queries.
 *
 * The workflow manages conversation context, analyzes queries, and executes
 * relevant search tools to provide comprehensive answers.
 */
import { StateGraph, END, START } from '@langchain/langgraph';
/**
 * @constant {object} researchAgentState
 * @description Defines the state schema (channels) for the research agent's StateGraph.
 * This object specifies the data structure that flows through the workflow,
 * holding current conversation context, messages, and other relevant information.
 */
import { researchAgentState } from './state.js';
/**
 * @function toolBasedSearchNode
 * @description Represents a node function within the StateGraph responsible for executing
 * tool-based searches. This function integrates with various search tools to
 * retrieve information based on the current query and state.
 * @param {object} state - The current state of the workflow, conforming to `researchAgentState`.
 * @returns {Promise<object>} A promise that resolves to the updated state after performing the search.
 */
import { toolBasedSearchNode } from './nodes.js';

/**
 * @constant {StateGraph} workflow
 * @description Initializes a new StateGraph instance for the research agent.
 * This graph defines the sequence of operations and decision points for
 * processing a user's search query, utilizing the `researchAgentState` for its channels.
 *
 * The workflow is configured with the following nodes and edges:
 * - **Nodes**:
 *   - `toolBasedSearch`: Implemented by `toolBasedSearchNode`, performs the primary tool-based search.
 * - **Edges**:
 *   - `START` -> `toolBasedSearch`: Initiates the search process.
 *   - `toolBasedSearch` -> `END`: Concludes the search process.
 */
const workflow = new StateGraph({ channels: researchAgentState });

console.log(
  '🚀 Initializing Enhanced Conversational Search Workflow with Tool-Based Intelligence'
);

workflow.addNode('toolBasedSearch', toolBasedSearchNode); // NEW: Primary tool-based search

// The workflow starts by managing conversation context, then analyzing the query
workflow.addEdge(START, 'toolBasedSearch');
workflow.addEdge('toolBasedSearch', END);

/**
 * @constant {CompiledStateGraph} researchAgentApp
 * @description Compiles the defined StateGraph into an executable application.
 * This compiled graph represents the complete, ready-to-run workflow for the
 * enhanced conversational search agent, encapsulating all nodes and transitions.
 * @returns {CompiledStateGraph} The compiled LangChain StateGraph application instance.
 */
export const researchAgentApp = workflow.compile();