import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import {
  analyzeContextNode,
  intelligentSearchNode,
  directAnswerNode,
  conversationalSynthesisNode,
  analyzeAnswerQualityNode
} from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

// Define the intelligent conversational workflow nodes
workflow.addNode("analyzeContext", analyzeContextNode);
workflow.addNode("intelligentSearch", intelligentSearchNode);
workflow.addNode("provideDirectAnswer", directAnswerNode);
workflow.addNode("analyzeAnswerQuality", analyzeAnswerQualityNode);
workflow.addNode("conversationalSynthesis", conversationalSynthesisNode);

// The workflow starts by analyzing context and determining the approach
workflow.addEdge(START, "analyzeContext");

// Define conditional routing based on intelligent analysis
workflow.addConditionalEdges(
  "analyzeContext",
  (state) => {
    console.log("Intelligent routing decision for query:", state.query, "→", state.needsSearch ? "search" : "direct");

    return state.needsSearch ? "search" : "direct";
  },
  {
    search: "intelligentSearch", // If search is needed, proceed to intelligent search
    direct: "provideDirectAnswer", // If not needed, give direct conversational answer
  }
);

// After direct answer, analyze its quality
workflow.addEdge("provideDirectAnswer", "analyzeAnswerQuality");

// After answer quality analysis, route to search or end
workflow.addConditionalEdges(
  "analyzeAnswerQuality",
  (state) => {
    console.log("Answer quality routing decision:", state.needsSearchFallback ? "search_fallback" : "end");

    return state.needsSearchFallback ? "search_fallback" : "end";
  },
  {
    search_fallback: "intelligentSearch", // If answer is inadequate, perform search
    end: END, // If answer is adequate, end the workflow
  }
);

// After intelligent search, synthesize with conversation awareness
workflow.addEdge("intelligentSearch", "conversationalSynthesis");

// Synthesis ends the workflow
workflow.addEdge("conversationalSynthesis", END);

// Instantiate the checkpointer with a specific collection name for conversational search
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "conversational_search_checkpoints");

export const researchAgentApp = workflow.compile({ checkpointer });
