import { StateGraph, END, START } from '@langchain/langgraph';
import { summarizerState } from './state.js';
import { fetchContentNode, summarizeContentNode } from './nodes.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';
import config from '../../../../../config/index.js';

const workflow = new StateGraph({ channels: summarizerState });

// Define the two-step workflow
workflow.addNode('fetch_content', fetchContentNode);
workflow.addNode('summarize_content', summarizeContentNode);

// The workflow starts by fetching the content...
workflow.addEdge(START, 'fetch_content');

// ...and then proceeds to summarize it.
workflow.addEdge('fetch_content', 'summarize_content');

// The process ends after summarization.
workflow.addEdge('summarize_content', END);

// Instantiate the checkpointer with a specific collection name for this agent.
// const checkpointer = await MongoDBSaver.fromUri(config.database_local, "summarizer_v2_checkpoints");

export const summarizerApp = workflow.compile();
