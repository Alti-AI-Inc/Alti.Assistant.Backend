import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import {
  analyzeContextNode,
  intelligentSearchNode,
  directAnswerNode,
  conversationalSynthesisNode,
  analyzeAnswerQualityNode,
  manageContextNode,
  youtubeSearchNode,
  checkYouTubeRelevanceNode,
  youtubeSearchForDirectAnswerNode,
  synthesizeDirectAnswerWithYouTubeNode,
  videoOnlySearchNode,
  videoOnlySynthesisNode
} from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

// Define the intelligent conversational workflow nodes
workflow.addNode("manageContext", manageContextNode);
workflow.addNode("analyzeContext", analyzeContextNode);
workflow.addNode("intelligentSearch", intelligentSearchNode);
workflow.addNode("youtubeSearch", youtubeSearchNode);
workflow.addNode("provideDirectAnswer", directAnswerNode);
workflow.addNode("analyzeAnswerQuality", analyzeAnswerQualityNode);
workflow.addNode("checkYouTubeRelevance", checkYouTubeRelevanceNode);
workflow.addNode("youtubeSearchForDirectAnswer", youtubeSearchForDirectAnswerNode);
workflow.addNode("synthesizeDirectAnswerWithYouTube", synthesizeDirectAnswerWithYouTubeNode);
workflow.addNode("videoOnlySearch", videoOnlySearchNode);
workflow.addNode("videoOnlySynthesis", videoOnlySynthesisNode);
workflow.addNode("conversationalSynthesis", conversationalSynthesisNode);

// The workflow starts by managing conversation context, then analyzing the query
workflow.addEdge(START, "manageContext");
workflow.addEdge("manageContext", "analyzeContext");

// Define conditional routing based on intelligent analysis
workflow.addConditionalEdges(
  "analyzeContext",
  (state) => {
    // First check if it's a video-only query
    if (state.isVideoOnlyQuery) {
      console.log("Video-only routing decision for query:", state.query, "→ video_only");
      return "video_only";
    }

    // Otherwise, use the existing routing logic
    console.log("Intelligent routing decision for query:", state.query, "→", state.needsSearch ? "search" : "direct");
    return state.needsSearch ? "search" : "direct";
  },
  {
    video_only: "videoOnlySearch", // New route for video-only queries
    search: "intelligentSearch", // If search is needed, proceed to intelligent search
    direct: "provideDirectAnswer", // If not needed, give direct conversational answer
  }
);

// Video-only workflow path
workflow.addEdge("videoOnlySearch", "videoOnlySynthesis");
workflow.addEdge("videoOnlySynthesis", END);

// After direct answer, analyze its quality
workflow.addEdge("provideDirectAnswer", "analyzeAnswerQuality");

// After answer quality analysis, route based on quality and check YouTube relevance
workflow.addConditionalEdges(
  "analyzeAnswerQuality",
  (state) => {
    console.log("Answer quality routing decision:", state.needsSearchFallback ? "search_fallback" : "check_youtube");

    return state.needsSearchFallback ? "search_fallback" : "check_youtube";
  },
  {
    search_fallback: "intelligentSearch", // If answer is inadequate, perform search
    check_youtube: "checkYouTubeRelevance", // If answer is adequate, check if YouTube would help
  }
);

// After checking YouTube relevance, route to YouTube search or final synthesis
workflow.addConditionalEdges(
  "checkYouTubeRelevance",
  (state) => {
    console.log("YouTube relevance routing decision:", state.needsYouTubeSearch ? "youtube_for_direct" : "synthesize_direct");

    return state.needsYouTubeSearch ? "youtube_for_direct" : "synthesize_direct";
  },
  {
    youtube_for_direct: "youtubeSearchForDirectAnswer", // If YouTube is relevant, search it
    synthesize_direct: "synthesizeDirectAnswerWithYouTube", // If not, synthesize with what we have
  }
);

// After YouTube search for direct answer, synthesize the combined result
workflow.addEdge("youtubeSearchForDirectAnswer", "synthesizeDirectAnswerWithYouTube");

// Direct answer synthesis ends the workflow
workflow.addEdge("synthesizeDirectAnswerWithYouTube", END);

// After intelligent search, perform YouTube search if relevant
workflow.addEdge("intelligentSearch", "youtubeSearch");
// After YouTube search, synthesize with conversation awareness
workflow.addEdge("youtubeSearch", "conversationalSynthesis");

// Synthesis ends the workflow
workflow.addEdge("conversationalSynthesis", END);

// Instantiate the checkpointer with a specific collection name for conversational search
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "conversational_search_checkpoints");

export const researchAgentApp = workflow.compile({ checkpointer });
