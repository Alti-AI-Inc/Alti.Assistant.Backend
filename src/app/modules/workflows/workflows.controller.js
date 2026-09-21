import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import WorkflowService from './workflows.service.js';

export const WorkflowController = {
  createWorkflow: catchAsync(async (req, res) => {
    const result = await WorkflowService.createWorkflow(req.user.id, req.body);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Workflow created successfully',
      data: result,
    });
  }),
  
  listWorkflows: catchAsync(async (req, res) => {
    const result = await WorkflowService.listWorkflows(req.user.id, req.query);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflows retrieved successfully',
      data: result,
    });
  }),
  
  getWorkflow: catchAsync(async (req, res) => {
    const result = await WorkflowService.getWorkflow(req.params.id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow retrieved successfully',
      data: result,
    });
  }),
  
  updateWorkflow: catchAsync(async (req, res) => {
    const result = await WorkflowService.updateWorkflow(req.params.id, req.body);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow updated successfully',
      data: result,
    });
  }),
  
  deleteWorkflow: catchAsync(async (req, res) => {
    const result = await WorkflowService.deleteWorkflow(req.params.id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow archived successfully',
      data: result,
    });
  }),
  
  updateStatus: catchAsync(async (req, res) => {
    const result = await WorkflowService.updateStatus(req.params.id, req.body.status);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow status updated successfully',
      data: result,
    });
  }),
  
  executeWorkflow: catchAsync(async (req, res) => {
    const result = await WorkflowService.executeWorkflow(req.params.id, req.body, req.user.id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow execution completed',
      data: result,
    });
  }),
  
  executeWorkflowStream: catchAsync(async (req, res) => {
    await WorkflowService.executeWorkflowStream(req.params.id, req.body, req.user.id, res);
  }),
  
  approveStep: catchAsync(async (req, res) => {
    const { id, stepId } = req.params;
    const result = await WorkflowService.approveStep(id, stepId, req.body.decision);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Approval processed successfully',
      data: result,
    });
  }),
  
  getWorkflowRuns: catchAsync(async (req, res) => {
    const result = await WorkflowService.getWorkflowRuns(req.params.id, req.query);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow runs retrieved successfully',
      data: result,
    });
  })
};

export default WorkflowController;
