import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { GcpNativeService } from './gcp-native.service.js';

const searchCatalog = catchAsync(async (req, res) => {
  const { query, license, language, sortBy, limit, page } = req.query;

  const result = await GcpNativeService.searchGcpCatalog(query, {
    license,
    language,
    sortBy,
    limit,
    page
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GCP Repository Catalog queried successfully.',
    data: result
  });
});

const importSubmodule = catchAsync(async (req, res) => {
  const { repoName } = req.body;

  const result = await GcpNativeService.importGcpSubmodule(repoName);

  sendResponse(res, {
    statusCode: result.success ? httpStatus.OK : httpStatus.BAD_REQUEST,
    success: result.success,
    message: result.message,
    data: result
  });
});

export const GcpNativeController = {
  searchCatalog,
  importSubmodule
};
