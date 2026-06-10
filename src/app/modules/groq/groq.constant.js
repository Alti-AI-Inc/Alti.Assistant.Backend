/**
 * @file Defines constants for the Groq module, specifically for service identifiers.
 * These constants are used throughout the application to reference specific services
 * related to Groq AI interactions, ensuring consistency and avoiding magic strings.
 * @module groq.constant
 */

/**
 * Service identifier for the Groq response POST service.
 * This constant is likely used for dependency injection or as a message pattern
 * for microservices to handle incoming POST requests related to Groq AI responses.
 * @constant
 * @type {string}
 */
export const GROQ_RESPONSE_SERVICE_POST = 'groq.response.service.post';

/**
 * Service identifier for the Groq response GET service.
 * This constant is likely used for dependency injection or as a message pattern
 * for microservices to handle requests to retrieve Groq AI responses.
 * @constant
 * @type {string}
 */
export const GROQ_RESPONSE_SERVICE_GET = 'groq.response.service.get';