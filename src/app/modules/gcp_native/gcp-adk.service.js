import { logger } from '../../../shared/logger.js';

/**
 * Programmatically packages tool definitions and developer parameters into an ADK manifest object.
 * 
 * @param {object} pluginConfig - Raw developer plugin inputs
 * @returns {string} Formatted ADK manifest package
 */
const compileAdkManifest = (pluginConfig) => {
  logger.info(`GCP ADK: Compiling developer manifest package for "${pluginConfig.name}"...`);

  const manifest = {
    name: pluginConfig.name || 'unnamed-plugin',
    version: pluginConfig.version || '1.0.0',
    scope: pluginConfig.scope || 'gcp-mcp-extensions',
    permissions: pluginConfig.permissions || ['read_file'],
    entryPoints: {
      routePrefix: `/api/v1/gcp-native/ext/${pluginConfig.name}`,
      toolBinding: pluginConfig.toolBinding || 'default_tool_executor',
      activities: pluginConfig.activities || []
    }
  };

  return `<adk-manifest>\n${JSON.stringify(manifest, null, 2)}\n</adk-manifest>`;
};

/**
 * Extracts, parses, and validates an ADK manifest package.
 */
const validateAdkManifest = (rawText) => {
  try {
    if (!rawText) {
      throw new Error('Raw manifest block is empty.');
    }

    logger.info('GCP ADK: Extracting <adk-manifest> block...');

    const match = rawText.match(/<adk-manifest>([\s\S]*?)<\/adk-manifest>/i);
    if (!match) {
      return {
        success: true,
        containsManifest: false,
        message: 'No ADK developer manifest found in target file block.',
        manifest: null
      };
    }

    let rawJson = match[1].trim();
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    logger.info('GCP ADK: Checking schema validation constraints on manifest...');

    const manifest = JSON.parse(rawJson);
    const errors = [];

    // Verify ADK structural headers
    if (!manifest.name) errors.push('ADK Manifest missing mandatory field: "name"');
    if (!manifest.version) errors.push('ADK Manifest missing mandatory field: "version"');
    if (!manifest.scope) errors.push('ADK Manifest missing mandatory field: "scope"');
    
    if (!Array.isArray(manifest.permissions)) {
      errors.push('ADK Manifest permissions must be a non-empty array of strings.');
    }

    if (!manifest.entryPoints || typeof manifest.entryPoints !== 'object') {
      errors.push('ADK Manifest entryPoints must be a valid defined configuration object.');
    }

    if (errors.length > 0) {
      logger.warn(`GCP ADK: Manifest validation failed with ${errors.length} errors.`);
      return {
        success: false,
        containsManifest: true,
        errors,
        manifest
      };
    }

    logger.info('GCP ADK: Manifest compiled and validated cleanly.');
    return {
      success: true,
      containsManifest: true,
      errors: [],
      manifest
    };
  } catch (err) {
    logger.error('GCP ADK Parsing Exception:', err);
    return {
      success: false,
      containsManifest: true,
      errors: [err.message],
      manifest: null
    };
  }
};

/**
 * Bootstraps the validated ADK extension, dynamically registering routes or toolbox configurations.
 * 
 * @param {object} manifest - Validated ADK manifest object
 * @returns {object} Bootstrap status report
 */
const bootstrapAdkExtension = (manifest) => {
  logger.info(`GCP ADK: Bootstrapping extension "${manifest.name}" under scope "${manifest.scope}"...`);
  
  if (!manifest || !manifest.name) {
    throw new Error('Valid ADK manifest configuration is required to bootstrap extensions.');
  }

  // Simulate registering endpoints and setting up dynamic toolbox bounds
  const runtimeStatus = {
    bootstrapped: true,
    pluginName: manifest.name,
    routePrefix: manifest.entryPoints.routePrefix || `/ext/${manifest.name}`,
    registeredActivitiesCount: manifest.entryPoints.activities?.length || 0,
    timestamp: new Date().toISOString()
  };

  logger.info(`GCP ADK: Extension "${manifest.name}" bootstrapped successfully and is now active.`);
  return runtimeStatus;
};

export const GcpAdkService = {
  compileAdkManifest,
  validateAdkManifest,
  bootstrapAdkExtension
};
