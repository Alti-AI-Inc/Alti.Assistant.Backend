import { logger } from '../../../shared/logger.js';

/**
 * Programmatically packages tool definitions and developer parameters into an ADK manifest object.
 * This function takes a raw plugin configuration object and transforms it into a structured
 * ADK manifest XML string, suitable for deployment or further processing within the GCP ecosystem.
 *
 * @param {object} pluginConfig - Raw developer plugin inputs.
 * @param {string} pluginConfig.name - The name of the plugin. Used for manifest name and route prefix.
 * @param {string} [pluginConfig.version='1.0.0'] - The version of the plugin.
 * @param {string} [pluginConfig.scope='gcp-mcp-extensions'] - The scope of the plugin within the GCP ecosystem.
 * @param {string[]} [pluginConfig.permissions=['read_file']] - An array of permissions required by the plugin.
 * @param {object} [pluginConfig.entryPoints] - Configuration for how the plugin integrates with the system.
 * @param {string} [pluginConfig.entryPoints.toolBinding='default_tool_executor'] - Specifies the tool executor to bind to.
 * @param {Array<object>} [pluginConfig.entryPoints.activities=[]] - An array of activity definitions for the plugin.
 * @returns {string} A formatted XML string representing the ADK manifest package.
 * @throws {Error} If `pluginConfig` is null, undefined, not an object, or an array.
 */
const compileAdkManifest = (pluginConfig) => {
  // Bug fix: Validate pluginConfig is a valid object before accessing its properties.
  // If pluginConfig is null, undefined, or not an object, accessing its properties would throw an error.
  if (!pluginConfig || typeof pluginConfig !== 'object' || Array.isArray(pluginConfig)) {
    throw new Error('Invalid plugin configuration provided. Expected a non-null object.');
  }

  const resolvedName = pluginConfig.name || 'unnamed-plugin';
  logger.info(`GCP ADK: Compiling developer manifest package for "${resolvedName}"...`);

  const manifest = {
    name: resolvedName,
    version: pluginConfig.version || '1.0.0',
    scope: pluginConfig.scope || 'gcp-mcp-extensions',
    permissions: pluginConfig.permissions || ['read_file'],
    entryPoints: {
      routePrefix: `/api/v1/gcp-native/ext/${resolvedName}`,
      toolBinding: pluginConfig.toolBinding || 'default_tool_executor',
      activities: pluginConfig.activities || []
    }
  };

  return `<adk-manifest>\n${JSON.stringify(manifest, null, 2)}\n</adk-manifest>`;
};

/**
 * Extracts, parses, and validates an ADK manifest package from a raw text block.
 * It looks for content enclosed within `<adk-manifest>` and `</adk-manifest>` tags,
 * parses it as JSON, and then applies a set of schema validation constraints.
 *
 * @param {string} rawText - The raw text block that may contain an ADK manifest.
 * @returns {object} An object containing the validation result.
 * @property {boolean} success - True if the manifest was successfully extracted, parsed, and validated without errors.
 * @property {boolean} containsManifest - True if an `<adk-manifest>` block was found in the `rawText`.
 * @property {string} [message] - A descriptive message, especially if no manifest is found.
 * @property {string[]} [errors] - An array of error messages if validation fails. Empty if successful.
 * @property {object|null} manifest - The parsed manifest object if found and successfully parsed, otherwise null.
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
    
    // Bug fix: Enhance permissions validation to check for non-empty array of strings,
    // as implied by the error message.
    if (!Array.isArray(manifest.permissions) || manifest.permissions.length === 0 || !manifest.permissions.every(p => typeof p === 'string')) {
      errors.push('ADK Manifest permissions must be a non-empty array of strings.');
    }

    if (!manifest.entryPoints || typeof manifest.entryPoints !== 'object' || Array.isArray(manifest.entryPoints)) { // Added Array.isArray check for robustness
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
 * This function simulates the process of activating an ADK extension based on its manifest,
 * preparing it for runtime operation within the GCP environment.
 *
 * @param {object} manifest - The validated ADK manifest object.
 * @param {string} manifest.name - The name of the plugin from the manifest.
 * @param {string} manifest.scope - The scope of the plugin from the manifest.
 * @param {object} manifest.entryPoints - Entry point configurations from the manifest.
 * @param {string} [manifest.entryPoints.routePrefix] - The base route prefix for the extension's APIs.
 * @param {Array<object>} [manifest.entryPoints.activities] - An array of activity definitions to be registered.
 * @returns {object} A status report detailing the outcome of the bootstrapping process.
 * @property {boolean} bootstrapped - True if the extension was successfully bootstrapped.
 * @property {string} pluginName - The name of the plugin that was bootstrapped.
 * @property {string} routePrefix - The route prefix under which the extension's APIs are registered.
 * @property {number} registeredActivitiesCount - The number of activities registered for the extension.
 * @property {string} timestamp - The ISO timestamp when the bootstrapping occurred.
 * @throws {Error} If the provided manifest is invalid or missing critical information.
 */
const bootstrapAdkExtension = (manifest) => {
  if (!manifest || !manifest.name) {
    throw new Error('Valid ADK manifest configuration is required to bootstrap extensions.');
  }

  logger.info(`GCP ADK: Bootstrapping extension "${manifest.name}" under scope "${manifest.scope}"...`);

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

/**
 * Provides a set of services for managing GCP ADK (Application Development Kit) extensions.
 * This includes compiling developer configurations into ADK manifests, validating existing manifests,
 * and simulating the bootstrapping process for these extensions.
 *
 * @namespace GcpAdkService
 */
export const GcpAdkService = {
  /**
   * @function compileAdkManifest
   * @memberof GcpAdkService
   * @see {@link compileAdkManifest}
   */
  compileAdkManifest,
  /**
   * @function validateAdkManifest
   * @memberof GcpAdkService
   * @see {@link validateAdkManifest}
   */
  validateAdkManifest,
  /**
   * @function bootstrapAdkExtension
   * @memberof GcpAdkService
   * @see {@link bootstrapAdkExtension}
   */
  bootstrapAdkExtension
};