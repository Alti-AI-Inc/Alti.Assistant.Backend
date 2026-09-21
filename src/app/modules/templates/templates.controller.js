import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { TemplateService } from './templates.service.js';

const listTemplates = catchAsync(async (req, res) => {
  const result = await TemplateService.listTemplates(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Templates retrieved successfully',
    data: result,
  });
});

const getTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.getTemplate(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template retrieved successfully',
    data: result,
  });
});

const deployTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.deployTemplate(req.user.id, req.params.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Template deployed successfully',
    data: result,
  });
});

const publishTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.publishTemplate(req.user.id, req.body.agentId);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Template published successfully',
    data: result,
  });
});

const updateTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.updateTemplate(req.params.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template updated successfully',
    data: result,
  });
});

const deleteTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.deleteTemplate(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template deleted successfully',
    data: result,
  });
});

const rateTemplate = catchAsync(async (req, res) => {
  const result = await TemplateService.rateTemplate(req.user.id, req.params.id, req.body.score);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template rated successfully',
    data: result,
  });
});

export const TemplateController = {
  listTemplates,
  getTemplate,
  deployTemplate,
  publishTemplate,
  updateTemplate,
  deleteTemplate,
  rateTemplate,
};
