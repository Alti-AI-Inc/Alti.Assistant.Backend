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

const workflow = new StateGraph({ channels: researchAgentState });

console.log("🚀 Initializing Enhanced Conversational Search Workflow with Tool-Based Intelligence");

workflow.addNode("toolBasedSearch", toolBasedSearchNode); // NEW: Primary tool-based search


// The workflow starts by managing conversation context, then analyzing the query
workflow.addEdge(START, "toolBasedSearch");
workflow.addEdge('toolBasedSearch', END);

export const researchAgentApp = workflow.compile();
