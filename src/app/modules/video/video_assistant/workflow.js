import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { videoGeneratorState } from "./state.js";
import {
  analyzeInitialVideoPromptNode,
  processVideoUserResponseNode,
  askVideoQuestionNode,
  getVideoConfirmationNode,
  compileVideoFinalPromptNode,
  generateVideoNode,
  routeVideoInitial,
  routeVideoNextStep,
} from "./nodes.js";
import config from "../../../../../config/index.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
// Initialize the video generation state machine
const videoWorkflow = new StateGraph({
  channels: videoGeneratorState,
});

// Add nodes to the graph
videoWorkflow.addNode("analyze_video_prompt", analyzeInitialVideoPromptNode);
videoWorkflow.addNode("process_video_response", processVideoUserResponseNode);
videoWorkflow.addNode("ask_video_question", askVideoQuestionNode);
videoWorkflow.addNode("get_video_confirmation", getVideoConfirmationNode);
videoWorkflow.addNode("compile_video_prompt", compileVideoFinalPromptNode);
videoWorkflow.addNode("generate_video", generateVideoNode);

// Define the workflow edges

// 1. ENTRY POINT: Decide if it's a new conversation or a continuing one.
videoWorkflow.addConditionalEdges(START, routeVideoInitial, {
  analyze_video_prompt: "analyze_video_prompt",
  process_video_response: "process_video_response",
});

// 2. Path for a new conversation.
videoWorkflow.addEdge("analyze_video_prompt", END); // End the turn after asking the first question.

// 3. Path for a continuing conversation: first process the user's message.
// 4. ROUTER: After processing, decide what to do next.
videoWorkflow.addConditionalEdges("process_video_response", routeVideoNextStep, {
  ask_video_question: "ask_video_question",
  get_video_confirmation: "get_video_confirmation",
  compile_video_prompt: "compile_video_prompt",
});

// 5. End the turn after asking a question or asking for confirmation.
videoWorkflow.addEdge("ask_video_question", END);
videoWorkflow.addEdge("get_video_confirmation", END);

// 6. If compiling, proceed to generate the video.
videoWorkflow.addEdge("compile_video_prompt", "generate_video");

// 7. After generating the video, the conversation is finished for now.
videoWorkflow.addEdge("generate_video", END);

const videoCheckpointer = await MongoDBSaver.fromUri(config.database_local, "video_checkpoints");
// Compile the graph into a runnable application
export const videoApp = videoWorkflow.compile({
  checkpointer: videoCheckpointer
});
