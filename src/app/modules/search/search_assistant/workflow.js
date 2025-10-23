/**
 * Enhanced Conversational Search Workflow with Tool-Based Intelligence
 * 
 * WORKFLOW OVERVIEW:
 * ==================
 * 
 * START → manageContext → analyzeContext → [ROUTING DECISION]
 *                                             │
 *                     ┌─────────────────────────┼─────────────────────────┐
 *                     │                         │                         │
 *                 video_only              tool_search                 direct
 *                     │                         │                         │
 *              videoOnlySearch          toolBasedSearch        provideDirectAnswer
 *                     │                         │                         │
 *              videoOnlySynthesis              END              analyzeAnswerQuality
 *                     │                                                   │
 *                    END                                      [QUALITY ROUTING]
 *                                                                        │
 *                                                    ┌───────────────────┴────────────────┐
 *                                                    │                                    │
 *                                           tool_search_fallback                checkYouTubeRelevance
 *                                                    │                                    │
 *                                             toolBasedSearch                   [YOUTUBE ROUTING]
 *                                                    │                                    │
 *                                                   END              ┌───────────────────┴─────────────┐
 *                                                                    │                                 │
 *                                                            youtube_for_direct            synthesize_direct
 *                                                                    │                                 │
 *                                                      youtubeSearchForDirectAnswer  synthesizeDirectAnswerWithYouTube
 *                                                                    │                                 │
 *                                                   synthesizeDirectAnswerWithYouTube                END
 *                                                                    │
 *                                                                   END
 * 
 * KEY FEATURES:
 * =============
 * 1. 🤖 TOOL-BASED INTELLIGENCE: Primary search uses LLM with search tools
 * 2. ⚡ FAST-TRACK OPTIMIZATION: Rule-based classification for simple queries
 * 3. 🎥 VIDEO-ONLY DETECTION: Specialized path for video content requests
 * 4. 🔄 INTELLIGENT FALLBACKS: Multiple levels of fallback for robustness
 * 5. 📊 PERFORMANCE MONITORING: Comprehensive logging and metrics
 * 
 * SEARCH DECISION FLOW:
 * ====================
 * - Video-only queries → Direct to video search
 * - Search-required queries → Tool-based intelligent search
 * - Simple factual queries → Direct answer with quality analysis
 * - Inadequate answers → Fallback to tool-based search
 * 
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { researchAgentState } from "./state.js";
import {
  toolBasedSearchNode,
} from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";

const workflow = new StateGraph({ channels: researchAgentState });

console.log("🚀 Initializing Enhanced Conversational Search Workflow with Tool-Based Intelligence");

// Define the intelligent conversational workflow nodes
// workflow.addNode("manageContext", manageContextNode);
// workflow.addNode("analyzeContext", analyzeContextNodeOptimized); // Use optimized analysis
workflow.addNode("toolBasedSearch", toolBasedSearchNode); // NEW: Primary tool-based search
// workflow.addNode("intelligentSearch", intelligentSearchNode); // Fallback search method
// workflow.addNode("youtubeSearch", youtubeSearchNode);
// workflow.addNode("provideDirectAnswer", directAnswerNode);
// workflow.addNode("analyzeAnswerQuality", analyzeAnswerQualityNode);
// workflow.addNode("checkYouTubeRelevance", checkYouTubeRelevanceNode);
// workflow.addNode("youtubeSearchForDirectAnswer", youtubeSearchForDirectAnswerNode);
// workflow.addNode("synthesizeDirectAnswerWithYouTube", synthesizeDirectAnswerWithYouTubeNode);
// workflow.addNode("videoOnlySearch", videoOnlySearchNode);
// workflow.addNode("videoOnlySynthesis", videoOnlySynthesisNode);
// workflow.addNode("conversationalSynthesis", conversationalSynthesisNode);

// The workflow starts by managing conversation context, then analyzing the query
workflow.addEdge(START, "toolBasedSearch");
workflow.addEdge('toolBasedSearch', END);
// workflow.addEdge("manageContext", "analyzeContext");

// // Define conditional routing based on intelligent analysis with tool-based approach
// workflow.addConditionalEdges(
//   "analyzeContext",
//   (state) => {
//     // First check if it's a video-only query
//     if (state.isVideoOnlyQuery) {
//       console.log("🎥 Video-only routing decision for query:", state.query, "→ video_only");
//       return "video_only";
//     }

//     // Check if we can use fast-track responses (optimized path)
//     if (state.fastTrack && state.responseType === 'direct') {
//       console.log("⚡ Fast-track direct answer for query:", state.query, "→ direct");
//       return "direct";
//     }

//     // For search-required queries, use the new tool-based approach
//     if (state.needsSearch || state.responseType === 'search') {
//       console.log("🤖 Tool-based search routing for query:", state.query, "→ tool_search");
//       return "tool_search";
//     }

//     // Default to direct answer
//     console.log("📝 Direct answer routing for query:", state.query, "→ direct");
//     return "direct";
//   },
//   {
//     video_only: "videoOnlySearch", // Video-only queries
//     tool_search: "toolBasedSearch", // NEW: Primary tool-based intelligent search
//     direct: "provideDirectAnswer", // Direct conversational answers
//   }
// );

// // Video-only workflow path
// workflow.addEdge("videoOnlySearch", "videoOnlySynthesis");
// workflow.addEdge("videoOnlySynthesis", END);

// // After direct answer, analyze its quality
// workflow.addEdge("provideDirectAnswer", "analyzeAnswerQuality");

// // After answer quality analysis, route based on quality and check YouTube relevance
// workflow.addConditionalEdges(
//   "analyzeAnswerQuality",
//   (state) => {
//     console.log("🔍 Answer quality routing decision:", state.needsSearchFallback ? "tool_search_fallback" : "check_youtube");

//     return state.needsSearchFallback ? "tool_search_fallback" : "check_youtube";
//   },
//   {
//     tool_search_fallback: "toolBasedSearch", // NEW: Use tool-based search for inadequate answers
//     check_youtube: "checkYouTubeRelevance", // If answer is adequate, check if YouTube would help
//   }
// );

// // After checking YouTube relevance, route to YouTube search or final synthesis
// workflow.addConditionalEdges(
//   "checkYouTubeRelevance",
//   (state) => {
//     console.log("YouTube relevance routing decision:", state.needsYouTubeSearch ? "youtube_for_direct" : "synthesize_direct");

//     return state.needsYouTubeSearch ? "youtube_for_direct" : "synthesize_direct";
//   },
//   {
//     youtube_for_direct: "youtubeSearchForDirectAnswer", // If YouTube is relevant, search it
//     synthesize_direct: "synthesizeDirectAnswerWithYouTube", // If not, synthesize with what we have
//   }
// );

// // After YouTube search for direct answer, synthesize the combined result
// workflow.addEdge("youtubeSearchForDirectAnswer", "synthesizeDirectAnswerWithYouTube");

// // Direct answer synthesis ends the workflow
// workflow.addEdge("synthesizeDirectAnswerWithYouTube", END);

// // NEW: Tool-based search is self-contained and ends workflow directly
// workflow.addEdge("toolBasedSearch", END);

// FALLBACK: Traditional search path (if tool-based search fails, it falls back to this internally)
// After intelligent search, perform YouTube search if relevant
// workflow.addEdge("intelligentSearch", "youtubeSearch");
// After YouTube search, synthesize with conversation awareness
// workflow.addEdge("youtubeSearch", "conversationalSynthesis");

// Synthesis ends the workflow
// workflow.addEdge("conversationalSynthesis", END);

// Instantiate the checkpointer with a specific collection name for conversational search
const checkpointer = await MongoDBSaver.fromUri(config.database_local, "conversational_search_checkpoints");

export const researchAgentApp = workflow.compile();
