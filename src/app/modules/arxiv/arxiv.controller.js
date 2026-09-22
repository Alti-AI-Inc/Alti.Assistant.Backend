import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import arxivService from './arxiv.service.js';

const searchPapers = catchAsync(async (req, res) => {
  const result = await arxivService.searchPapers(req.body.query, req.body.options || {});
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'arXiv papers retrieved successfully',
    data: result,
  });
});

export default { searchPapers };
