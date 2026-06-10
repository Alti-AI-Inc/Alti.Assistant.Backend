const Joi = require('joi');
const { objectId } = require('../../validations/custom.validation');

/**
 * @module browserUseValidation
 * @description Joi validation schemas for browser use records.
 */

/**
 * @const {object} createBrowserUse
 * @description Validation schema for creating a new browser use record.
 * @property {object} body - The request body.
 * @property {string} body.url - The URL of the browsed page. Must be a valid URI.
 * @property {string} [body.title] - The title of the browsed page.
 * @property {string} [body.textContent] - The extracted text content from the page.
 * @property {string} [body.htmlContent] - The full HTML content of the page.
 * @property {string} [body.screenshot] - A reference or data (e.g., base64) for a screenshot of the page.
 * @property {string} body.assistantId - The MongoDB ObjectId of the assistant associated with this browser use.
 */
const createBrowserUse = {
  body: Joi.object().keys({
    url: Joi.string().uri().required(),
    title: Joi.string().optional().allow(''),
    textContent: Joi.string().optional().allow(''),
    htmlContent: Joi.string().optional().allow(''),
    screenshot: Joi.string().optional().allow(''),
    assistantId: Joi.string().custom(objectId).required(),
  }),
};

/**
 * @const {object} getBrowserUses
 * @description Validation schema for querying browser use records.
 * @property {object} query - The request query parameters.
 * @property {string} [query.assistantId] - Filter browser use records by the associated assistant's MongoDB ObjectId.
 * @property {string} [query.sortBy] - Sorting criteria (e.g., 'createdAt:desc').
 * @property {number} [query.limit] - Maximum number of results to return per page.
 * @property {number} [query.page] - Page number for pagination.
 */
const getBrowserUses = {
  query: Joi.object().keys({
    assistantId: Joi.string().custom(objectId),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

/**
 * @const {object} getBrowserUse
 * @description Validation schema for fetching a single browser use record by its ID.
 * @property {object} params - The URL parameters.
 * @property {string} params.browserUseId - The MongoDB ObjectId of the browser use record.
 */
const getBrowserUse = {
  params: Joi.object().keys({
    browserUseId: Joi.string().custom(objectId).required(),
  }),
};

/**
 * @const {object} deleteBrowserUse
 * @description Validation schema for deleting a single browser use record by its ID.
 * @property {object} params - The URL parameters.
 * @property {string} params.browserUseId - The MongoDB ObjectId of the browser use record to delete.
 */
const deleteBrowserUse = {
  params: Joi.object().keys({
    browserUseId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createBrowserUse,
  getBrowserUses,
  getBrowserUse,
  deleteBrowserUse,
};