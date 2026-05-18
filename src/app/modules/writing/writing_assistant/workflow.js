import { StateGraph, END, START } from '@langchain/langgraph';
import { writingAssistantState } from './state.js';
import config from '../../../../../config/index.js';
import * as nodes from './nodes.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';

const workflow = new StateGraph({ channels: writingAssistantState });

// workflow.addNode("analyze_topic", nodes.analyzeTopicNode);
// workflow.addNode("process_response", nodes.processResponseNode);
// workflow.addNode("ask_question", nodes.askQuestionNode);
// workflow.addNode("get_confirmation", nodes.getConfirmationNode);
workflow.addNode('write_content', nodes.writeContentNode);

workflow.addEdge(START, 'write_content');
// workflow.addEdge("analyze_topic", END);
// workflow.addConditionalEdges("process_response", nodes.routeNextStep, {
//   ask_question: "ask_question",
//   get_confirmation: "get_confirmation",
//   write_content: "write_content",
// });
// workflow.addEdge("ask_question", END);
// workflow.addEdge("get_confirmation", END);
workflow.addEdge('write_content', END);

const checkpointer = await MongoDBSaver.fromUri(
  config.database_local,
  'writer_checkpoints'
);
export const writingAssistantApp = workflow.compile({ checkpointer });
