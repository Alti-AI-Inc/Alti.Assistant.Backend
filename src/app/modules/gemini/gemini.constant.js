/**
 * @file This file contains constants related to Gemini service event names.
 * @module modules/gemini/gemini.constant
 * @author [Your Name/Organization Here]
 */

/**
 * @constant {string} GEMINI_RESPONSE_SERVICE_POST
 * @description Represents the event name for a POST operation related to Gemini service responses.
 * This constant is typically used for dispatching or listening to events when a new Gemini response
 * is created or updated via a POST request.
 */
export const GEMINI_RESPONSE_SERVICE_POST = 'gemini.response.service.post';

/**
 * @constant {string} GEMINI_RESPONSE_SERVICE_GET
 * @description Represents the event name for a GET operation related to Gemini service responses.
 * This constant is typically used for dispatching or listening to events when Gemini responses
 * are retrieved via a GET request.
 */
export const GEMINI_RESPONSE_SERVICE_GET = 'gemini.response.service.get';