import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { TraceService } from './traces.service.js';

const listTraces = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await TraceService.listTraces(userId, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Traces retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getDashboard = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await TraceService.getDashboard(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Dashboard retrieved successfully',
    data: result,
  });
});

const getAgentAnalytics = catchAsync(async (req, res) => {
  const { agentId } = req.params;
  const result = await TraceService.getAgentAnalytics(agentId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent analytics retrieved successfully',
    data: result,
  });
});

const getAgentCosts = catchAsync(async (req, res) => {
  const { agentId } = req.params;
  const result = await TraceService.getAgentCosts(agentId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent costs retrieved successfully',
    data: result,
  });
});

const exportTraces = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { format = 'json', startDate, endDate } = req.query;
  const result = await TraceService.exportTraces(userId, { format, startDate, endDate });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="traces.csv"');
    return res.status(httpStatus.OK).send(result);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Traces exported successfully',
    data: result,
  });
});

const getTrace = catchAsync(async (req, res) => {
  const { runId } = req.params;
  const result = await TraceService.getTrace(runId);
  if (!result) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Trace not found',
      data: null,
    });
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trace retrieved successfully',
    data: result,
  });
});

const addFeedback = catchAsync(async (req, res) => {
  const { runId } = req.params;
  const result = await TraceService.addFeedback(runId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback added successfully',
    data: result,
  });
});

const deleteTrace = catchAsync(async (req, res) => {
  const { runId } = req.params;
  await TraceService.deleteTrace(runId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trace deleted successfully',
    data: null,
  });
});

export const TraceController = {
  listTraces,
  getDashboard,
  getAgentAnalytics,
  getAgentCosts,
  exportTraces,
  getTrace,
  addFeedback,
  deleteTrace,
};
