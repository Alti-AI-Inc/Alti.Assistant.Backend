import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import { 
  analyzeContextNode, 
  intelligentSearchNode, 
  directAnswerNode, 
  conversationalSynthesisNode 
} from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

// Define the intelligent conversational workflow nodes
workflow.addNode("analyzeContext", analyzeContextNode);
workflow.addNode("intelligentSearch", intelligentSearchNode);
workflow.addNode("directAnswer", directAnswerNode);
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
    direct: "directAnswer", // If not needed, give direct conversational answer
  }
);

// After intelligent search, synthesize with conversation awareness
workflow.addEdge("intelligentSearch", "conversationalSynthesis");

// Both direct answer and synthesis end the workflow
workflow.addEdge("directAnswer", END);
workflow.addEdge("conversationalSynthesis", END);

// Instantiate the checkpointer with a specific collection name for conversational search
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "conversational_search_checkpoints");

export const researchAgentApp = workflow.compile({ checkpointer });
