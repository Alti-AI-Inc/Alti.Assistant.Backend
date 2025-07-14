import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import { convertTheSearchResultsToGenerativeAnswerUsingAI, searchNode } from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

// Define the two-step workflow
workflow.addNode("search", searchNode);
workflow.addNode("synthesize", convertTheSearchResultsToGenerativeAnswerUsingAI);

// The workflow starts by searching...
workflow.addEdge(START, "search");

// ...and then proceeds to synthesize the results.
workflow.addEdge("search", "synthesize");

// The process ends after synthesis.
workflow.addEdge("synthesize", END);

// Instantiate the checkpointer with a specific collection name.
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "research_checkpoints");

export const researchAgentApp = workflow.compile({ checkpointer });
