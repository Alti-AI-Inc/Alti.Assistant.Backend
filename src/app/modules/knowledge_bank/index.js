/**
 * @file This file serves as the main entry point for the knowledge bank module,
 * re-exporting various components for easy access throughout the application.
 * It consolidates routes, controllers, services, and models related to the knowledge bank feature.
 */

/**
 * @module knowledgeBankRoutes
 * @description Exports the Express router containing all API routes for the knowledge bank feature.
 * These routes define the endpoints for interacting with knowledge bank files and folders.
 */
export { default as knowledgeBankRoutes } from './knowledge_bank.routes.js';

/**
 * @module knowledgeBankController
 * @description Exports the controller object/class for the knowledge bank feature.
 * This controller contains the request handlers for processing knowledge bank-related API requests.
 */
export { knowledgeBankController } from './knowledge_bank.controller.js';

/**
 * @module knowledgeBankService
 * @description Exports the service object/class for the knowledge bank feature.
 * This service encapsulates the business logic and data operations for knowledge bank entities.
 */
export { knowledgeBankService } from './knowledge_bank.service.js';

/**
 * @module KnowledgeBankFile
 * @description Exports the Mongoose model for Knowledge Bank Files.
 * This model defines the schema and provides an interface for interacting with file documents in the database.
 */
export { default as KnowledgeBankFile } from './knowledge_bank.model.js';

/**
 * @module KnowledgeBankFolder
 * @description Exports the Mongoose model for Knowledge Bank Folders.
 * This model defines the schema and provides an interface for interacting with folder documents in the database.
 */
export { default as KnowledgeBankFolder } from './knowledge_bank_folder.model.js';