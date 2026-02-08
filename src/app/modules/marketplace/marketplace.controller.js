import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { MarketplaceService } from './marketplace.service.js';

const installApp = catchAsync(async (req, res) => {
    const { appId } = req.body;
    const result = await MarketplaceService.installApp(req.user.id, appId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'App installed successfully',
        data: result,
    });
});

const uninstallApp = catchAsync(async (req, res) => {
    const { appId } = req.body;
    const result = await MarketplaceService.uninstallApp(req.user.id, appId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'App uninstalled successfully',
        data: result,
    });
});

const getInstalledApps = catchAsync(async (req, res) => {
    const result = await MarketplaceService.getInstalledApps(req.user.id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Installed apps retrieved successfully',
        data: result,
    });
});

export const MarketplaceController = {
    installApp,
    uninstallApp,
    getInstalledApps
};
