import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { composioOthersService } from './composio.others.service.js';

// =============================
//     GitHub Controller
// =============================
const getGithubIntegration = catchAsync(async (req, res) => {
  const result = await composioOthersService.getGithubIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched GitHub integration',
    data: result,
  });
});

const initiateGithubConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioOthersService.initiateGithubConnectionService(integrationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated GitHub connection',
    data: result,
  });
});
const createGitHubRepo = catchAsync(async (req, res) => {
  const result = await composioOthersService.createGitHubRepoService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Repository created successfully',
    data: result,
  });
});
const listGitHubPullRequests = catchAsync(async (req, res) => {
  const result = await composioOthersService.getAPullRequestsService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pull requests fetched successfully',
    data: result,
  });
});
const listGitHubBranches = catchAsync(async (req, res) => {
  const result = await composioOthersService.listGitHubBranchesService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Branches fetched successfully',
    data: result,
  });
});

const createGithubIssue = catchAsync(async (req, res) => {
  const result = await composioOthersService.createGithubIssueService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GitHub issue created',
    data: result,
  });
});
const followGitHubUser = catchAsync(async (req, res) => {
  const result = await composioOthersService.followGitHubUserService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched GitHub repositories',
    data: result,
  });
});
const unfollowGitHubUser = catchAsync(async (req, res) => {
  const result = await composioOthersService.unfollowGitHubUserService(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Successfully unfollowed GitHub user',
    data: result,
  });
});

const listFollowingGitHubUsers = catchAsync(async (req, res) => {
  const result =
    await composioOthersService.listFollowingGitHubUsersService(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fetched followed GitHub users',
    data: result,
  });
});

const listGitHubFollowers = catchAsync(async (req, res) => {
  const result = await composioOthersService.listGitHubFollowersService(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fetched followers of authenticated GitHub user',
    data: result,
  });
});

const listGitHubRepos = catchAsync(async (req, res) => {
  const result = await composioOthersService.listGitHubReposService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched GitHub repositories',
    data: result,
  });
});
const listOfOtherGitHubRepos = catchAsync(async (req, res) => {
  const result =
    await composioOthersService.listOfOthersGitHubReposService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched GitHub repositories',
    data: result,
  });
});
// =============================
//     Amazon Controller
// =============================

const initiateAmazonConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioOthersService.initiateAmazonConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Amazon connection initiated',
    data: result,
  });
});

const searchAmazonProduct = catchAsync(async (req, res) => {
  const result = await composioOthersService.searchAmazonProductService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Amazon product search successful',
    data: result,
  });
});

export const composioOthersController = {
  getGithubIntegration,
  initiateGithubConnection,
  createGitHubRepo,
  listGitHubPullRequests,
  listGitHubBranches,
  createGithubIssue,
  followGitHubUser,
  unfollowGitHubUser,
  listFollowingGitHubUsers,
  listGitHubFollowers,
  listGitHubRepos,
  listOfOtherGitHubRepos,
  initiateAmazonConnection,
  searchAmazonProduct,
};
