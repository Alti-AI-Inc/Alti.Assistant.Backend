/**
 * @file This barrel file serves as the main entry point for the 'knowledge' module.
 * It re-exports all public components, including controllers, services, routes, models,
 * and constants, making them easily accessible from a single import path.
 * @module KnowledgeModule
 */

/**
 * @exports knowledgeController
 * @description Re-exports the knowledge controller, which handles HTTP requests related to knowledge management.
 * This controller contains the logic for processing requests and orchestrating responses.
 * @see {@link module:KnowledgeController}
 */
export { knowledgeController } from './knowledge.controller.js';

/**
 * @exports knowledgeService
 * @description Re-exports the knowledge service, which encapsulates business logic for knowledge operations.
 * This service interacts with models and external resources to perform core functionalities.
 * @see {@link module:KnowledgeService}
 */
export { knowledgeService } from './knowledge.service.js';

/**
 * @exports knowledgeRoutes
 * @description Re-exports the knowledge routes, defining API endpoints for knowledge-related functionalities.
 * These routes map incoming requests to the appropriate controller methods.
 * @see {@link module:KnowledgeRoutes}
 */
export { knowledgeRoutes } from './knowledge.route.js';

/**
 * @exports KnowledgeFile
 * @description Re-exports the Mongoose model for Knowledge Files, representing individual knowledge documents or assets.
 * This model defines the schema and provides an interface for database operations on knowledge files.
 * @see {@link module:KnowledgeFileModel}
 */
export { default as KnowledgeFile } from './knowledge.model.js';

/**
 * @exports KnowledgeFolder
 * @description Re-exports the Mongoose model for Knowledge Folders, used to organize and categorize knowledge files.
 * This model defines the schema and provides an interface for database operations on knowledge folders.
 * @see {@link module:KnowledgeFolderModel}
 */
export { default as KnowledgeFolder } from './knowledge_folder.model.js';

/**
 * @exports * from './knowledge.constant.js'
 * @description Re-exports all constants defined in `knowledge.constant.js`.
 * These constants provide configuration values, fixed strings, or other immutable data used throughout the knowledge module.
 * @see {@link module:KnowledgeConstants}
 */
export * from './knowledge.constant.js';