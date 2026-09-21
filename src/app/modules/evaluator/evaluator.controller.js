import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { EvaluatorService } from './evaluator.service.js';

const evaluate = catchAsync(async (req, res) => {
  const result = await EvaluatorService.evaluateResponse(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Evaluation completed successfully',
    data: result,
  });
});

const compare = catchAsync(async (req, res) => {
  const result = await EvaluatorService.compareResponses(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Comparison completed successfully',
    data: result,
  });
});

const rubric = catchAsync(async (req, res) => {
  const result = await EvaluatorService.generateRubric(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Rubric generated successfully',
    data: result,
  });
});

export const EvaluatorController = {
  evaluate,
  compare,
  rubric
};
