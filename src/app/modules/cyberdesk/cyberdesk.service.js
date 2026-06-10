import { createCyberdeskClient } from 'cyberdesk';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';

/**
 * @typedef {object} CyberdeskClient
 * Represents the Cyberdesk API client instance.
 */

/**
 * A singleton getter function for the Cyberdesk API client.
 * This function ensures that the Cyberdesk client is initialized only once
 * and reused across all calls. It lazily initializes the client when first accessed.
 * The API key is retrieved from the application configuration and any BOM characters are stripped.
 *
 * @returns {CyberdeskClient} The initialized Cyberdesk API client instance.
 */
const getCyberdeskClient = (() => {
  let _client = null;
  return () => {
    if (!_client) {
      // Lazy init: by the time any route calls this, config BOM-stripping has run
      const apiKey = (config.cyberdesk_api_key || '').replace(/^\uFEFF+/, '');
      _client = createCyberdeskClient({ apiKey });
    }
    return _client;
  };
})();

/**
 * Launches a new Cyberdesk virtual desktop instance.
 * It sends a request to the Cyberdesk API to provision a new desktop.
 *
 * @async
 * @returns {Promise<object>} A promise that resolves with the result of the desktop launch operation.
 *   The result object typically contains details about the launched desktop, including its ID.
 * @throws {ApiError} If the Cyberdesk API returns an error during the launch process.
 *   The error status will be `httpStatus.BAD_REQUEST`.
 */
const launchDesktop = async () => {
  const result = await getCyberdeskClient().launchDesktop({
    body: { timeout_ms: 600000 },
  });
  
  // Structured GCP Cloud Logging
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'Cyberdesk launch result',
    result
  }));
  
  console.log(JSON.stringify({
    severity: result.error ? 'ERROR' : 'INFO',
    message: 'Cyberdesk error object check',
    error: result.error
  }));

  if ('error' in result)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      result.error.message || 'Cyberdesk API Error'
    );
  return result;
};

/**
 * Retrieves information about a specific Cyberdesk virtual desktop.
 *
 * @async
 * @param {string} desktopId The unique identifier of the desktop to retrieve information for.
 * @returns {Promise<object>} A promise that resolves with an object containing the desktop's information.
 * @throws {Error} If the Cyberdesk API returns an error when fetching desktop information.
 */
const getDesktopInfo = async (desktopId) => {
  const result = await getCyberdeskClient().getDesktop({ path: { id: desktopId } });
  if ('error' in result) throw new Error(result.error);
  return result;
};

/**
 * Performs a mouse click action within a specified Cyberdesk virtual desktop.
 *
 * @async
 * @param {string} desktopId The unique identifier of the desktop where the click should occur.
 * @param {number} x The X-coordinate for the mouse click.
 * @param {number} y The Y-coordinate for the mouse click.
 * @returns {Promise<object>} A promise that resolves with the result of the mouse click action.
 * @throws {Error} If the Cyberdesk API returns an error during the click action.
 */
const clickMouse = async (desktopId, x, y) => {
  const result = await getCyberdeskClient().executeComputerAction({
    path: { id: desktopId },
    body: {
      type: 'click_mouse',
      x,
      y,
      button: 'left',
    },
  });
  if ('error' in result) {
    // Structured GCP Cloud Logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Cyberdesk Action Error',
      error: result.error
    }));
    throw new Error(result.error.message || 'Unknown Cyberdesk Error');
  }
  return result;
};

/**
 * Executes a bash command within a specified Cyberdesk virtual desktop.
 *
 * @async
 * @param {string} desktopId The unique identifier of the desktop where the command should be executed.
 * @param {string} command The bash command string to execute.
 * @returns {Promise<object>} A promise that resolves with the result of the bash command execution.
 *   This typically includes the command's output and exit status.
 */
const executeBash = async (desktopId, command) => {
  const result = await getCyberdeskClient().executeBashAction({
    path: { id: desktopId },
    body: { command },
  });
  return result;
};

/**
 * Terminates a running Cyberdesk virtual desktop instance.
 *
 * @async
 * @param {string} desktopId The unique identifier of the desktop to terminate.
 * @returns {Promise<object>} A promise that resolves with the result of the termination operation.
 *   This typically confirms the desktop has been queued for termination.
 */
const terminateDesktop = async (desktopId) => {
  const result = await getCyberdeskClient().terminateDesktop({ path: { id: desktopId } });
  return result;
};

/**
 * @namespace cyberdeskService
 * @description Provides a collection of functions for interacting with the Cyberdesk API.
 * This service encapsulates all Cyberdesk-related operations, including launching,
 * managing, and terminating virtual desktops, as well as performing actions within them.
 */
export const cyberdeskService = {
  /**
   * @function launchDesktop
   * @memberof cyberdeskService
   * @description Launches a new Cyberdesk virtual desktop instance.
   * @see {@link launchDesktop} for implementation details.
   */
  launchDesktop,
  /**
   * @function getDesktopInfo
   * @memberof cyberdeskService
   * @description Retrieves information about a specific Cyberdesk virtual desktop.
   * @see {@link getDesktopInfo} for implementation details.
   */
  getDesktopInfo,
  /**
   * @function clickMouse
   * @memberof cyberdeskService
   * @description Performs a mouse click action within a specified Cyberdesk virtual desktop.
   * @see {@link clickMouse} for implementation details.
   */
  clickMouse,
  /**
   * @function executeBash
   * @memberof cyberdeskService
   * @description Executes a bash command within a specified Cyberdesk virtual desktop.
   * @see {@link executeBash} for implementation details.
   */
  executeBash,
  /**
   * @function terminateDesktop
   * @memberof cyberdeskService
   * @description Terminates a running Cyberdesk virtual desktop instance.
   * @see {@link terminateDesktop} for implementation details.
   */
  terminateDesktop,
};