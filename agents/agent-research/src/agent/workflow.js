import { StateGraph, Annotation } from '@langchain/langgraph';
import researchService from '../services/researchService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('researchWorkflow');

const ResearchState = Annotation.Root({
  topic: Annotation(),
  researchPlan: Annotation(),
  breadthResults: Annotation(),
  leads: Annotation(),
  deepDiveResults: Annotation(),
  synthesis: Annotation(),
  debate: Annotation(),
  refinedSynthesis: Annotation(),
  savedPath: Annotation(),
  pdfPath: Annotation(),
  userId: Annotation(),
  status: Annotation(),
  error: Annotation()
});

async function initialize(state) {
  logger.info('initialize node');
  const res = await researchService.initializeResearch(state.topic);
  return { researchPlan: res.plan, status: 'initialized' };
}

async function breadthSearch(state) {
  logger.info('breadthSearch node');
  const res = await researchService.breadthSearch(state.topic, 'auto terms');
  return { breadthResults: res, status: 'breadth_searched' };
}

async function identifyLeads(state) {
  logger.info('identifyLeads node');
  const res = await researchService.identifyLeads(state.breadthResults);
  return { leads: res, status: 'leads_identified' };
}

async function deepDive(state) {
  logger.info('deepDive node');
  const res = await researchService.deepDive(state.leads);
  return { deepDiveResults: res, status: 'deep_dived' };
}

async function synthesizeReport(state) {
  logger.info('synthesizeReport node');
  const res = await researchService.synthesizeReport(state.deepDiveResults, state.topic);
  return { synthesis: res, status: 'synthesized' };
}

async function boardDebate(state) {
  logger.info('boardDebate node');
  const res = await researchService.boardDebate(state.synthesis);
  return { debate: res, status: 'debated' };
}

async function refineSynthesis(state) {
  logger.info('refineSynthesis node');
  const res = await researchService.refineSynthesis(state.synthesis, state.debate);
  return { refinedSynthesis: res, status: 'refined' };
}

async function saveResearch(state) {
  logger.info('saveResearch node');
  const res = await researchService.saveResearch(state.refinedSynthesis, state.userId);
  return { savedPath: res.savedId, status: 'saved' };
}

async function generatePdf(state) {
  logger.info('generatePdf node');
  const res = await researchService.generatePdf(state.refinedSynthesis);
  return { pdfPath: res.pdfUrl, status: 'completed' };
}

const workflow = new StateGraph(ResearchState)
  .addNode('initialize', initialize)
  .addNode('breadthSearch', breadthSearch)
  .addNode('identifyLeads', identifyLeads)
  .addNode('deepDive', deepDive)
  .addNode('synthesizeReport', synthesizeReport)
  .addNode('boardDebate', boardDebate)
  .addNode('refineSynthesis', refineSynthesis)
  .addNode('saveResearch', saveResearch)
  .addNode('generatePdf', generatePdf)
  .addEdge('__start__', 'initialize')
  .addEdge('initialize', 'breadthSearch')
  .addEdge('breadthSearch', 'identifyLeads')
  .addEdge('identifyLeads', 'deepDive')
  .addEdge('deepDive', 'synthesizeReport')
  .addEdge('synthesizeReport', 'boardDebate')
  .addEdge('boardDebate', 'refineSynthesis')
  .addEdge('refineSynthesis', 'saveResearch')
  .addEdge('saveResearch', 'generatePdf')
  .addEdge('generatePdf', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting deep research workflow');
  return await app.invoke(input);
}
