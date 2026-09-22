import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LCELService } from './langchain.lcel.service.js';
import { CommunityIntegrationsService } from './langchain.community.service.js';

const router = express.Router();
router.use(auth());

// ═══════════════════════════════════════════════════════════════════════════════
//  LCEL (LangChain Expression Language) ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/lcel/sequence', catchAsync(async (req, res) => {
  const result = await LCELService.runSequence(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL sequence executed.', data: result });
}));

router.post('/lcel/parallel', catchAsync(async (req, res) => {
  const result = await LCELService.runParallel(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL parallel executed.', data: result });
}));

router.post('/lcel/branch', catchAsync(async (req, res) => {
  const result = await LCELService.runBranch(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL branch executed.', data: result });
}));

router.post('/lcel/history', catchAsync(async (req, res) => {
  const result = await LCELService.runWithHistory(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL history chain executed.', data: result });
}));

router.post('/lcel/batch', catchAsync(async (req, res) => {
  const result = await LCELService.runBatch(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL batch processed.', data: result });
}));

router.post('/lcel/fallback', catchAsync(async (req, res) => {
  const result = await LCELService.runWithFallback(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LCEL fallback chain executed.', data: result });
}));

router.post('/lcel/parse-json', catchAsync(async (req, res) => {
  const result = await LCELService.parseJSON(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'JSON parsed.', data: result });
}));

router.post('/lcel/parse-csv', catchAsync(async (req, res) => {
  const result = await LCELService.parseCSVList(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'CSV list parsed.', data: result });
}));

router.post('/lcel/parse-structured', catchAsync(async (req, res) => {
  const result = await LCELService.parseZodStructured(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Structured output parsed.', data: result });
}));

router.post('/lcel/transform', catchAsync(async (req, res) => {
  const result = await LCELService.runLambdaTransform(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Lambda transform executed.', data: result });
}));

router.post('/lcel/passthrough-retrieval', catchAsync(async (req, res) => {
  const result = await LCELService.runPassthroughRetrieval(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Passthrough retrieval executed.', data: result });
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMUNITY INTEGRATIONS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Swarm
router.post('/swarm', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.runSwarm(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Swarm executed.', data: result });
}));

// Custom Tool Agents
router.post('/agent/custom-tools', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.runAgentWithCustomTools(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Custom tools agent executed.', data: result });
}));

router.post('/agent/structured-tools', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.runStructuredToolAgent(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Structured tool agent executed.', data: result });
}));

// MongoDB Memory
router.post('/memory/mongodb', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.runMongoDBMemoryChat(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'MongoDB memory chat executed.', data: result });
}));

router.delete('/memory/mongodb/:sessionId', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.clearMongoDBHistory({ sessionId: req.params.sessionId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'MongoDB history cleared.', data: result });
}));

// Community Document Loaders
router.post('/document-loaders/confluence', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.loadConfluence(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Confluence loaded.', data: result });
}));

router.post('/document-loaders/s3', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.loadS3File(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'S3 file loaded.', data: result });
}));

router.post('/document-loaders/sitemap', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.loadSitemap(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Sitemap loaded.', data: result });
}));

router.post('/document-loaders/recursive-url', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.loadRecursiveURL(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Recursive URL loaded.', data: result });
}));

// Embeddings & Similarity
router.post('/embeddings', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.generateEmbeddings(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Embeddings generated.', data: result });
}));

router.post('/similarity', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.semanticSimilarity(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Similarity computed.', data: result });
}));

// Multi-Modal
router.post('/multimodal', catchAsync(async (req, res) => {
  const result = await CommunityIntegrationsService.multiModalChat(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Multi-modal chat executed.', data: result });
}));

// Integration Catalog
router.get('/integrations', catchAsync(async (req, res) => {
  const result = CommunityIntegrationsService.listAvailableIntegrations();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Integrations listed.', data: result });
}));

export const LangChainExtendedRoutes = router;
export default LangChainExtendedRoutes;
