/**
 * @fileoverview This file defines constants related to the forum module,
 * including predefined category values and valid pagination fields.
 * @module forum/forum.constant
 */

/**
 * An array of predefined string values representing valid categories for forum posts.
 * These categories help in organizing and filtering forum content.
 * @type {string[]}
 */
module.exports.categoryValues = [
  'Beauty & Wellness',
  'Fashion',
  'Fitness and Exercise',
  'Food and Cooking',
  'Gaming and eSports',
  'Gift Ideas',
  'Home & Living',
  'Latest Trends',
  'Mental Health',
  'Quantum Quests',
  'Style Tips',
  'Tech Talk',
  'Technology and Gadgets',
];

/**
 * An array of string values representing the valid query parameters
 * that can be used for pagination in API requests.
 * @type {string[]}
 */
module.exports.paginationFields = ['page', 'limit', 'sortBy', 'sortOrder'];