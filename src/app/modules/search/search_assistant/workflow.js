import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import {
  toolBasedSearchNode,
} from "./nodes.js";

const workflow = new StateGraph({ channels: researchAgentState });

console.log("🚀 Initializing Enhanced Conversational Search Workflow with Tool-Based Intelligence");

workflow.addNode("toolBasedSearch", toolBasedSearchNode); // NEW: Primary tool-based search


// The workflow starts by managing conversation context, then analyzing the query
workflow.addEdge(START, "toolBasedSearch");
workflow.addEdge('toolBasedSearch', END);

export const researchAgentApp = workflow.compile();
