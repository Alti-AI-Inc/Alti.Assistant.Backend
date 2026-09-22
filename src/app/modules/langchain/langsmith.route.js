import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LangSmithService } from './langsmith.service.js';

const router = express.Router();
router.use(auth());

// ─── Projects ────────────────────────────────────────────────────────────────
router.get('/projects', catchAsync(async (req, res) => {
  const result = await LangSmithService.listProjects();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Projects listed.', data: result });
}));

router.get('/projects/stats', catchAsync(async (req, res) => {
  const result = await LangSmithService.getProjectStats({ projectName: req.query.projectName });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Project stats retrieved.', data: result });
}));

// ─── Runs / Traces ───────────────────────────────────────────────────────────
router.get('/runs', catchAsync(async (req, res) => {
  const result = await LangSmithService.listRuns(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Runs listed.', data: result });
}));

router.get('/runs/:runId', catchAsync(async (req, res) => {
  const result = await LangSmithService.getRun({ runId: req.params.runId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Run retrieved.', data: result });
}));

router.post('/runs/:runId/share', catchAsync(async (req, res) => {
  const result = await LangSmithService.shareRun({ runId: req.params.runId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Run shared.', data: result });
}));

// ─── Datasets ────────────────────────────────────────────────────────────────
router.get('/datasets', catchAsync(async (req, res) => {
  const result = await LangSmithService.listDatasets();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Datasets listed.', data: result });
}));

router.post('/datasets', catchAsync(async (req, res) => {
  const result = await LangSmithService.createDataset(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Dataset created.', data: result });
}));

router.get('/datasets/:datasetId', catchAsync(async (req, res) => {
  const result = await LangSmithService.getDataset({ datasetId: req.params.datasetId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dataset retrieved.', data: result });
}));

router.delete('/datasets/:datasetId', catchAsync(async (req, res) => {
  const result = await LangSmithService.deleteDataset({ datasetId: req.params.datasetId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dataset deleted.', data: result });
}));

// ─── Examples ────────────────────────────────────────────────────────────────
router.post('/datasets/:datasetId/examples', catchAsync(async (req, res) => {
  const result = await LangSmithService.addExamples({ datasetId: req.params.datasetId, examples: req.body.examples });
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Examples added.', data: result });
}));

router.get('/datasets/:datasetId/examples', catchAsync(async (req, res) => {
  const result = await LangSmithService.listExamples({ datasetId: req.params.datasetId, limit: parseInt(req.query.limit) || 50 });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Examples listed.', data: result });
}));

// ─── Feedback ────────────────────────────────────────────────────────────────
router.post('/feedback', catchAsync(async (req, res) => {
  const result = await LangSmithService.createFeedback(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Feedback created.', data: result });
}));

router.get('/feedback/:runId', catchAsync(async (req, res) => {
  const result = await LangSmithService.listFeedback({ runId: req.params.runId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Feedback listed.', data: result });
}));

router.post('/feedback/token', catchAsync(async (req, res) => {
  const result = await LangSmithService.createPresignedFeedbackToken(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Feedback token created.', data: result });
}));

// ─── Annotation Queues ──────────────────────────────────────────────────────
router.get('/annotation-queues', catchAsync(async (req, res) => {
  const result = await LangSmithService.listAnnotationQueues();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Annotation queues listed.', data: result });
}));

router.post('/annotation-queues', catchAsync(async (req, res) => {
  const result = await LangSmithService.createAnnotationQueue(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Annotation queue created.', data: result });
}));

// ─── Prompt Hub ──────────────────────────────────────────────────────────────
router.get('/prompts', catchAsync(async (req, res) => {
  const result = await LangSmithService.listPrompts();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prompts listed.', data: result });
}));

router.post('/prompts', catchAsync(async (req, res) => {
  const result = await LangSmithService.pushPrompt(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Prompt pushed.', data: result });
}));

router.get('/prompts/:promptName', catchAsync(async (req, res) => {
  const result = await LangSmithService.pullPrompt({ promptName: req.params.promptName });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prompt pulled.', data: result });
}));

// ─── Evaluation ──────────────────────────────────────────────────────────────
router.post('/evaluate', catchAsync(async (req, res) => {
  const result = await LangSmithService.runEvaluation(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Evaluation executed.', data: result });
}));

// ─── Monitoring Dashboard ───────────────────────────────────────────────────
router.get('/dashboard', catchAsync(async (req, res) => {
  const result = await LangSmithService.getMonitoringDashboard();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dashboard data retrieved.', data: result });
}));

// ─── Manual Tracing ─────────────────────────────────────────────────────────
router.post('/traces', catchAsync(async (req, res) => {
  const result = await LangSmithService.createRunTree(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Trace created.', data: result });
}));

export const LangSmithRoutes = router;
export default LangSmithRoutes;
