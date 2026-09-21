import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { TemporalService } from './temporal.service.js';

const startWorkflow = catchAsync(async (req, res) => {
  const result = await TemporalService.startWorkflow(req.body);
  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Workflow started.',
    data: result,
  });
});

const getWorkflow = catchAsync(async (req, res) => {
  const result = await TemporalService.getWorkflow(req.params.workflowId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Workflow status retrieved.',
    data: result,
  });
});

const signalWorkflow = catchAsync(async (req, res) => {
  const { signalName, signalArgs } = req.body;
  const result = await TemporalService.signalWorkflow(req.params.workflowId, signalName, signalArgs);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Signal sent to workflow.',
    data: result,
  });
});

const terminateWorkflow = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const result = await TemporalService.terminateWorkflow(req.params.workflowId, reason);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Workflow terminated.',
    data: result,
  });
});

const listSchedules = catchAsync(async (req, res) => {
  const result = await TemporalService.listSchedules();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Scheduled workflows listed.',
    data: result,
  });
});

export const TemporalController = {
  startWorkflow,
  getWorkflow,
  signalWorkflow,
  terminateWorkflow,
  listSchedules,
};

export default TemporalController;
