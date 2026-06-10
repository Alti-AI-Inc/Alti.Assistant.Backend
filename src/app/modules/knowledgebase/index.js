/**
 * @module app/modules/knowledgebase
 * @description Barrel file for the knowledge base module.
 * This file aggregates and re-exports the main components of the knowledge base module,
 * including the controller, service, and routes, to simplify imports in other parts of the application.
 */

/**
 * Re-exports the knowledge base controller, which handles incoming HTTP requests for knowledge base operations.
 * @type {import('./knowledgebase.controller.js').knowledgebaseController}
 */
export { knowledgebaseController } from './knowledgebase.controller.js';

/**
 * Re-exports the knowledge base service, which contains the business logic for managing knowledge bases.
 * @type {import('./knowledgebase.service.js').knowledgebaseService}
 */
export { knowledgebaseService } from './knowledgebase.service.js';

/**
 * Re-exports the Express router for knowledge base API endpoints.
 * @type {import('express').Router}
 */
export { default as knowledgebaseRoutes } from './knowledgebase.routes.js';