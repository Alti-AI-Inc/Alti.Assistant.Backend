/**
 * @file This file contains constants related to Deepseek service response events.
 * @module deepseek.constants
 * @description Defines event names used for posting and getting Deepseek service responses within the application.
 */

/**
 * @constant {string} DEEPSEEK_RESPONSE_SERVICE_POST
 * @description Represents the event name for posting a Deepseek service response.
 * This constant is used to identify the specific event when a Deepseek response is being sent or created.
 */
export const DEEPSEEK_RESPONSE_SERVICE_POST = 'deepseek.response.service.post';

/**
 * @constant {string} DEEPSEEK_RESPONSE_SERVICE_GET
 * @description Represents the event name for retrieving or getting a Deepseek service response.
 * This constant is used to identify the specific event when a Deepseek response is being requested or fetched.
 */
export const DEEPSEEK_RESPONSE_SERVICE_GET = 'deepseek.response.service.get';