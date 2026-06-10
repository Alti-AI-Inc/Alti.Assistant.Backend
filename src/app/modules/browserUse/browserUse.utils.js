// C:\Users\hyper\workspace\Alti.Assistant\Alti.Assistant.Backend\src\app\modules\browserUse\browserUse.utils.js

const puppeteer = require('puppeteer');
const ip = require('ip'); // For more robust IP validation.
// Platform Owner Feature: Import system-wide services for configuration, tenant management, and logging.
const { getTenantById } = require('../tenant/tenant.service'); // Assumes a service to get full tenant details.
const { getPlatformConfig } = require('../platform/platform.service'); // Assumes a service for global settings.
const logger = require('../../../config/logger'); // Assume a centralized, structured logger is configured.
const AppError = require('../../utils/AppError'); // Assume a custom error class for consistent error handling.

/**
 * Platform Owner Feature: Centralized function to get browser launch options.
 * This merges default settings with platform-wide configurations,
 * allowing the Platform Owner to control browser behavior globally (e.g., proxies, user agents, executable paths).
 * @param {object} userContext - The context of the user making the request, containing tenant and user information.
 * @returns {Promise<import('puppeteer').LaunchOptions>} A promise that resolves to the Puppeteer launch options object.
 */
async function getBrowserLaunchOptions(userContext) {
    const platformConfig = await getPlatformConfig();

    const defaultOptions = {
        headless: 'new', // Use the new headless mode for better compatibility and features.
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Recommended for running in containerized environments like Docker.
            '--disable-gpu', // Often helps prevent issues in server environments without a dedicated GPU.
        ],
    };

    // Platform Owner can specify a custom executable path, proxy server, etc., in the platform config.
    const mergedOptions = {
        ...defaultOptions,
        ...platformConfig.puppeteerOptions, // e.g., { executablePath: '/usr/bin/google-chrome', slowMo: 50 }
    };

    logger.debug('Puppeteer launch options configured.', { userContext, options: mergedOptions });

    return mergedOptions;
}

/**
 * Launches a browser instance with platform-aware configuration.
 * This function utilizes `getBrowserLaunchOptions` to ensure that all browser instances
 * adhere to the centrally managed platform settings.
 * @param {object} userContext - The context of the user making the request ({ tenantId, userId, role }).
 * @returns {Promise<import('puppeteer').Browser>} A promise that resolves to a Puppeteer Browser instance.
 */
async function launchBrowser(userContext) {
    const launchOptions = await getBrowserLaunchOptions(userContext);
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

/**
 * Platform Owner Feature: Enhanced URL validation.
 * Blocks tenants from accessing private/internal network resources (e.g., localhost, 192.168.x.x),
 * but allows the Platform Owner to access them for diagnostic or administrative purposes.
 * This is a critical security measure in a multi-tenant environment to prevent SSRF attacks.
 * @param {string} url - The URL to validate.
 * @param {object} userContext - The context of the user making the request, containing the user's role.
 * @param {string} userContext.role - The role of the user (e.g., 'PlatformOwner', 'TenantAdmin').
 * @throws {AppError} If the URL is invalid, uses a forbidden protocol, or points to a restricted network resource for the user's role.
 */
function validateUrl(url, userContext) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (error) {
        throw new AppError('Invalid URL provided.', 400);
    }

    // Platform Owners are exempt from private network restrictions for administrative tasks.
    if (userContext.role === 'PlatformOwner') {
        logger.warn(`Platform Owner accessing potentially restricted URL: ${url}`, { userContext });
        return; // Bypass further checks for Platform Owner.
    }

    // For tenants, enforce strict rules.
    const forbiddenProtocols = ['file:'];
    if (forbiddenProtocols.includes(parsedUrl.protocol)) {
        throw new AppError(`Protocol "${parsedUrl.protocol}" is not allowed.`, 403);
    }

    // Disallow access to private IP ranges for tenants.
    // This is more robust than simple string matching for 'localhost'.
    if (ip.isPrivate(parsedUrl.hostname) || parsedUrl.hostname === 'localhost') {
        throw new AppError('Access to internal or local network resources is forbidden.', 403);
    }
}


/**
 * Navigates to a URL and takes a screenshot, with Platform Owner controls and oversight.
 * This function enforces multi-tenant security and usage policies. It validates the URL,
 * checks tenant status (active/suspended), and enforces usage limits. Platform Owners
 * have elevated privileges, bypassing certain restrictions for administrative purposes.
 *
 * @permission This function has role-based access control:
 * - **All Roles**: Can request screenshots, subject to tenant status and limits.
 * - **PlatformOwner**: Bypasses URL restrictions (can access internal IPs) and tenant usage limits. Can operate without a `tenantId`.
 *
 * @multitenancy This function is tenant-aware.
 * - A valid `tenantId` is required for all users except the `PlatformOwner`.
 * - It checks if the tenant is active and not suspended.
 * - It enforces tenant-specific usage limits (e.g., `maxScreenshots`).
 *
 * @param {object} userContext - The context of the user making the request.
 * @param {string} userContext.tenantId - The ID of the tenant making the request. Can be null for Platform Owner.
 * @param {string} userContext.userId - The ID of the user making the request.
 * @param {string} userContext.role - The role of the user (e.g., 'PlatformOwner', 'TenantAdmin').
 * @param {string} url - The URL to navigate to.
 * @param {import('puppeteer').ScreenshotOptions} [options={}] - Options for the screenshot (e.g., fullPage: true).
 * @returns {Promise<Buffer>} - A promise that resolves to the screenshot image buffer.
 * @throws {AppError} Throws an error for various reasons including invalid URL, tenant issues (not found, suspended, limit reached), or if Puppeteer fails.
 */
async function takeScreenshot(userContext, url, options = {}) {
    const { tenantId, role } = userContext;

    // Platform Owner Feature: Global oversight through detailed logging for a complete audit trail.
    logger.info(`Screenshot requested for URL: ${url}`, { userContext, url, options });

    // Platform Owner Feature: URL validation that distinguishes between tenants and admins.
    validateUrl(url, userContext);

    // Platform Owner can operate without a tenant context or on behalf of any tenant.
    // Regular users must belong to an active, non-suspended tenant.
    if (tenantId) {
        const tenant = await getTenantById(tenantId);
        if (!tenant) {
            throw new AppError('Tenant not found.', 404);
        }

        // Platform Owner Feature: Enforce tenant suspension, preventing usage from suspended accounts.
        if (!tenant.isActive) {
            logger.warn(`Action denied for suspended tenant: ${tenantId}`, { userContext });
            throw new AppError('Tenant is suspended. Please contact support.', 403);
        }

        // Platform Owner Feature: Ability to override tenant-specific limits for administrative purposes.
        // The Platform Owner role bypasses this check entirely.
        if (role !== 'PlatformOwner') {
            const usage = tenant.usage.screenshots || 0;
            const limit = tenant.limits.maxScreenshots || 100; // Use a sensible default limit if not set.
            if (usage >= limit) {
                logger.error(`Screenshot limit reached for tenant: ${tenantId}`, { userContext, usage, limit });
                throw new AppError(`Screenshot limit of ${limit} reached for this tenant.`, 429); // Use 429 Too Many Requests
            }
        }
    } else if (role !== 'PlatformOwner') {
        // Ensure non-admins are always associated with a tenant.
        throw new AppError('A valid tenant context is required for this operation.', 400);
    }

    let browser;
    try {
        browser = await launchBrowser(userContext);
        const page = await browser.newPage();

        // Set a reasonable default viewport. This could also be a platform-level configuration.
        await page.setViewport({ width: 1280, height: 720 });

        // Add a reasonable timeout to prevent pages from hanging indefinitely.
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const screenshotOptions = {
            type: 'png', // Default to png for quality
            ...options, // Allow overriding options like fullPage, quality, etc.
        };
        const screenshot = await page.screenshot(screenshotOptions);

        // In a real application, increment the tenant's usage count in the database here.
        // e.g., await incrementTenantUsage(tenantId, 'screenshots');

        logger.info(`Successfully captured screenshot for URL: ${url}`, { userContext });
        return screenshot;
    } catch (error) {
        // Platform Owner Feature: Detailed error logging for global troubleshooting.
        // GCP AUDIT: For GCP Error Reporting compatibility, the full error stack is included directly in the message.
        // This allows GCP to automatically parse, group, and alert on exceptions.
        logger.error(`Failed to take screenshot for URL: ${url}. Stack: ${error.stack}`, {
            userContext,
            url,
            errorMessage: error.message, // Provide the clean error message as separate metadata for easier querying.
        });
        // Re-throw a user-friendly error to the client.
        throw new AppError(`Could not process the page at the specified URL. Please ensure the URL is correct and publicly accessible.`, 500);
    } finally {
        // Ensure browser resources are always released.
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = {
    takeScreenshot,
    // Do not export launchBrowser directly unless absolutely necessary for other trusted modules.
    // Exposing lower-level functions can increase the attack surface.
};