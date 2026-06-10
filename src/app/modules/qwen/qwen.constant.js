/**
 * @fileoverview This file defines constants related to Qwen service events and topics.
 * These constants are used for inter-service communication, typically with a message broker
 * like RabbitMQ, to identify specific types of requests or responses within the Qwen module.
 * @module qwen/qwen.constant
 * @author Your Name/Organization (if applicable)
 */

/**
 * Represents the topic or event name for a POST request to the Qwen response service.
 * This constant is likely used to publish or subscribe to messages related to
 * creating or updating Qwen responses.
 * @type {string}
 * @constant
 */
export const QWEN_RESPONSE_SERVICE_POST = 'qwen.response.service.post';

/**
 * Represents the topic or event name for a POST request to the Qwen QWQ response service.
 * This constant might be used for a specific variant or sub-service of the Qwen response
 * service, possibly indicating a different type of Qwen interaction or data.
 * @type {string}
 * @constant
 */
export const QWEN_QWQ_RESPONSE_SERVICE_POST = 'qwen.qwq.response.service.post';

/**
 * Represents the topic or event name for a GET request to the Qwen response service.
 * This constant is likely used to publish or subscribe to messages related to
 * retrieving Qwen responses.
 * @type {string}
 * @constant
 */
export const QWEN_RESPONSE_SERVICE_GET = 'qwen.response.service.get';