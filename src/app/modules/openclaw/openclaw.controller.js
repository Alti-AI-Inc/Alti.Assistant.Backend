import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { OpenClawService } from './openclaw.service.js';

const createAgent = catchAsync(async (req, res) => {
  const result = await OpenClawService.createAgent(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'OpenClaw persistent daemon spawned.',
    data: result,
  });
});

const getAgent = catchAsync(async (req, res) => {
  const result = await OpenClawService.getAgent(req.params.agentId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OpenClaw agent state retrieved.',
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const { message } = req.body;
  const result = await OpenClawService.sendMessage(req.params.agentId, message, req.user?.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent responded.',
    data: result,
  });
});

const listSkills = catchAsync(async (req, res) => {
  const result = await OpenClawService.listSkills();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OpenClaw skills listed.',
    data: result,
  });
});

const executeSkill = catchAsync(async (req, res) => {
  const { skillId, params } = req.body;
  const result = await OpenClawService.executeSkill(skillId, params);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Skill ${skillId} executed.`,
    data: result,
  });
});

const crawlUrl = catchAsync(async (req, res) => {
  const { url } = req.body;
  const result = await OpenClawService.crawlUrl(url);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Crawl completed.',
    data: result,
  });
});

export const OpenClawController = {
  createAgent,
  getAgent,
  sendMessage,
  listSkills,
  executeSkill,
  crawlUrl,
};

export default OpenClawController;
