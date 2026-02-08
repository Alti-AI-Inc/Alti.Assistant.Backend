import { User } from '../user/user.model.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

const installApp = async (userId, appId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    if (!user.installedApps.includes(appId)) {
        user.installedApps.push(appId);
        await user.save();
    }

    return user.installedApps;
};

const uninstallApp = async (userId, appId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    user.installedApps = user.installedApps.filter(id => id !== appId);
    await user.save();

    return user.installedApps;
};

const getInstalledApps = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    return user.installedApps;
}

export const MarketplaceService = {
    installApp,
    uninstallApp,
    getInstalledApps
};
