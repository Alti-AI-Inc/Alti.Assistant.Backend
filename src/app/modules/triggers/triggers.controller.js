import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { TriggerService } from './triggers.service.js';

const createTrigger = catchAsync(async (req, res) => {
  const trigger = await TriggerService.createTrigger(req.user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Trigger created successfully',
    data: trigger,
  });
});

const listTriggers = catchAsync(async (req, res) => {
  const result = await TriggerService.listTriggers(req.user.id, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Triggers retrieved successfully',
    data: result.data,
    meta: result.meta,
  });
});

const getTrigger = catchAsync(async (req, res) => {
  const trigger = await TriggerService.getTrigger(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trigger retrieved successfully',
    data: trigger,
  });
});

const updateTrigger = catchAsync(async (req, res) => {
  const trigger = await TriggerService.updateTrigger(req.params.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trigger updated successfully',
    data: trigger,
  });
});

const deleteTrigger = catchAsync(async (req, res) => {
  await TriggerService.deleteTrigger(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trigger deleted successfully',
  });
});

const updateStatus = catchAsync(async (req, res) => {
  const trigger = await TriggerService.updateStatus(req.params.id, req.body.status);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trigger status updated successfully',
    data: trigger,
  });
});

const testFire = catchAsync(async (req, res) => {
  const result = await TriggerService.testFire(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trigger test fired successfully',
    data: result,
  });
});

const handleWebhook = catchAsync(async (req, res) => {
  const { webhookId } = req.params;
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;
  
  const result = await TriggerService.handleWebhook(webhookId, payload, signature);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Webhook processed successfully',
    data: result,
  });
});

const handleEvent = catchAsync(async (req, res) => {
  const { eventSource, payload } = req.body;
  const results = await TriggerService.handleEvent(eventSource, payload);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event processed successfully',
    data: results,
  });
});

export const TriggerController = {
  createTrigger,
  listTriggers,
  getTrigger,
  updateTrigger,
  deleteTrigger,
  updateStatus,
  testFire,
  handleWebhook,
  handleEvent,
};
