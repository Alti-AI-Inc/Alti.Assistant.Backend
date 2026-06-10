/**
 * @file Defines constants related to OpenAI service response events.
 * These constants are used for event names or identifiers within the application
 * to manage and track interactions with the OpenAI service.
 * @module openAiConstants
 */

/**
 * @constant {string} OPENAI_RESPONSE_SERVICE_POST
 * @description Event name or identifier for a successful POST response from the OpenAI service.
 * This could be used for dispatching events after a new request has been sent to OpenAI
 * and a response has been received, typically for creating or sending data.
 */
export const OPENAI_RESPONSE_SERVICE_POST = 'openai.response.service.post';

/**
 * @constant {string} OPENAI_RESPONSE_SERVICE_GET
 * @description Event name or identifier for a successful GET response from the OpenAI service.
 * This could be used for dispatching events after data has been successfully retrieved
 * from the OpenAI service, typically for fetching existing information.
 */
export const OPENAI_RESPONSE_SERVICE_GET = 'openai.response.service.get';