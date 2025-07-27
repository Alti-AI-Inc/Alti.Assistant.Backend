import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import { checkIfSearchNeededByAi, convertTheSearchResultsToGenerativeAnswerUsingAI, searchNode, giveAnswer } from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

// Define the workflow nodes
workflow.addNode("checkIfSearchNeeded", checkIfSearchNeededByAi);
workflow.addNode("search", searchNode);
workflow.addNode("synthesize", convertTheSearchResultsToGenerativeAnswerUsingAI);
workflow.addNode("giveAnswer", giveAnswer); // Add the missing giveAnswer node

// The workflow starts by checking if search is needed...
workflow.addEdge(START, "checkIfSearchNeeded");

// Define conditional routing based on search need
workflow.addConditionalEdges(
  "checkIfSearchNeeded",
  (state) => {
    // The condition function that determines the next node
    console.log("Checking if search is needed for query:", state);
    
    return state.isSearchNeeded ? "search" : "giveAnswer";
  },
  {
    search: "search", // If search is needed, proceed to search
    giveAnswer: "giveAnswer", // If not needed, directly give answer without search
  }
);


// ...and then proceeds to synthesize the results.
workflow.addEdge("search", "synthesize");

workflow.addEdge("giveAnswer", END);

// The process ends after synthesis.
workflow.addEdge("synthesize", END);

// Instantiate the checkpointer with a specific collection name.
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "research_checkpoints");

export const researchAgentApp = workflow.compile({ checkpointer });
