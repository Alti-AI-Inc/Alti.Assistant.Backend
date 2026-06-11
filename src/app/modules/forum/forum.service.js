const paginationHelpers = require('../../helpers/paginationHelpers');
const Forum = require('./forum.model');
const UserForumActivities = require('./forumUserActivities.model');
const {
  withTenantContext,
  withTenantFilter,
} = require('../../helpers/tenantQuery');

/**
 * Retrieves a paginated list of forums based on search terms, filters, and tenant context.
 * 
 * @async
 * @function getForumService
 * @param {Object} filters - Filter criteria for the query.
 * @param {string} [filters.searchTerm] - Search term to match against forum title or category (case-insensitive).
 * @param {Object} [filters.filtersData] - Additional key-value pairs for exact match filtering.
 * @param {Object} paginationOptions - Pagination and sorting options.
 * @param {number} [paginationOptions.page] - Page number.
 * @param {number} [paginationOptions.limit] - Number of items per page.
 * @param {string} [paginationOptions.sortBy] - Field to sort by.
 * @param {string} [paginationOptions.sortOrder] - Sort order ('asc' or 'desc').
 * @param {import('express').Request|null} [req=null] - Express request object used to extract tenant context for multi-tenant isolation.
 * @returns {Promise<{meta: {page: number, limit: number, total: number}, data: Array<Object>}>} Paginated forum data and metadata.
 */
module.exports.getForumService = async (
  filters,
  paginationOptions,
  req = null
) => {
  const { searchTerm, ...filtersData } = filters;

  // Renamed for clarity, as it's used for forum search
  const forumSearchableFields = ['title', 'category'];
  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      $or: forumSearchableFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (Object.keys(filtersData).length) {
      andConditions.push({
          $and: Object.entries(filtersData).map(([field, value]) => ({
              [field]: value,
          })),
      });
  }

  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  }

  const baseQuery = andConditions.length > 0 ? { $and: andConditions } : {};
  const finalQuery = req ? withTenantFilter(req, baseQuery) : baseQuery;

  // Optimization: Added .lean() for read-only queries to return plain JavaScript objects,
  // improving performance by skipping Mongoose document instantiation.
  // Indexing Recommendation:
  // - For 'searchTerm' on 'title' and 'category': Consider creating a text index for better performance.
  //   Example: `db.forums.createIndex({ title: "text", category: "text" })`
  // - For 'filtersData' fields: Ensure fields used in filtersData (e.g., 'authorId', 'status') are indexed.
  //   Example: `db.forums.createIndex({ authorId: 1 })`
  // - For 'sortBy' field: Ensure the field used for sorting (e.g., 'createdAt') is indexed.
  //   Example: `db.forums.createIndex({ createdAt: -1 })`
  // - If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed, potentially as a compound index
  //   with other frequently queried fields (e.g., `db.forums.createIndex({ tenantId: 1, category: 1 })`).
  // N+1 / Heavy Populate Fix: Removed .populate('userActivities') from the list query.
  // Populating a potentially large array of activities for every forum in a list is inefficient
  // and can lead to large payloads and high memory usage. This data should be fetched in the
  // detail view (getForumServiceById) or activity counts should be denormalized onto the Forum model.
  // Optimization: Added .select() to the author population to only fetch necessary fields.
  const forumData = await Forum.find(finalQuery)
    .populate({ path: 'author', select: 'name email' }) // Only fetch essential author fields
    .sort(sortConditions)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Forum.countDocuments(finalQuery);
  return {
    meta: {
      page,
      limit,
      total,
    },
    data: forumData,
  };
};

/**
 * Creates a new forum post, automatically injecting tenant context if available.
 * 
 * @async
 * @function addForumServices
 * @param {Object} data - The forum creation payload.
 * @param {import('express').Request|null} [req=null] - Express request object used to inject tenant context.
 * @returns {Promise<Object>} The newly created forum document.
 */
module.exports.addForumServices = async (data, req = null) => {
  const result = await Forum.create(req ? withTenantContext(req, data) : data);
  return result;
};

/**
 * Retrieves a single forum post by its unique ID, scoped to the tenant context.
 * Also populates author and user activity details.
 * 
 * @async
 * @function getForumServiceById
 * @param {string} id - The unique ID of the forum post.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Object|null>} The forum document with populated fields, or null if not found.
 */
module.exports.getForumServiceById = async (id, req = null) => {
  const query = { _id: id };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, _id: 1 })`.
  // Optimization: Populate related data for the detail view, which is more efficient than doing it in the list view.
  const result = await Forum.findOne(
    req ? withTenantFilter(req, query) : query
  )
    .populate('author')
    .populate('userActivities')
    .lean();
  return result;
};

/**
 * Retrieves all forum posts authored by a specific email address, scoped to the tenant context.
 * 
 * @async
 * @function getForumServiceByEmail
 * @param {string} email - The author's email address.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Array<Object>>} A list of forum documents matching the author's email.
 */
module.exports.getForumServiceByEmail = async (email, req = null) => {
  const query = { authorEmail: email };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: Create an index on 'authorEmail' for efficient lookup.
  // Example: `db.forums.createIndex({ authorEmail: 1 })`
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, authorEmail: 1 })`.
  const result = await Forum.find(
    req ? withTenantFilter(req, query) : query
  ).lean();
  return result;
};

/**
 * Updates an existing forum post by its ID, scoped to the tenant context.
 * 
 * @async
 * @function updateForumService
 * @param {string} id - The unique ID of the forum post to update.
 * @param {Object} data - The update payload.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Object>} The update operation result metadata.
 */
module.exports.updateForumService = async (id, data, req = null) => {
  const query = { _id: id };
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await Forum.updateOne(
    req ? withTenantFilter(req, query) : query,
    { $set: data },
    { runValidators: true }
  );

  return result;
};

/**
 * Deletes a forum post by its ID, scoped to the tenant context.
 * 
 * @async
 * @function deleteForumService
 * @param {string} id - The unique ID of the forum post to delete.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Object>} The delete operation result metadata.
 */
exports.deleteForumService = async (id, req = null) => {
  const query = { _id: id };
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await Forum.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};

/**
 * Retrieves up to 3 suggested forum posts matching a specific category, scoped to the tenant context.
 * 
 * @async
 * @function getForumSuggestionService
 * @param {string} name - The category name to filter suggestions by.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Array<Object>>} A list of up to 3 suggested forum documents.
 */
module.exports.getForumSuggestionService = async (name, req = null) => {
  const query = { category: name };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: Create an index on 'category' for efficient lookup.
  // Example: `db.forums.createIndex({ category: 1 })`
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, category: 1 })`.
  const result = await Forum.find(
    req ? withTenantFilter(req, query) : query
  )
    .limit(3)
    .lean();
  return result;
};

/**
 * Creates a user activity record (e.g., comment, like) associated with a forum, scoped to the tenant context.
 * 
 * @async
 * @function addUserForumActivityServices
 * @param {Object} data - The user activity payload.
 * @param {import('express').Request|null} [req=null] - Express request object used to inject tenant context.
 * @returns {Promise<Object>} The newly created user activity document.
 */
module.exports.addUserForumActivityServices = async (data, req = null) => {
  const result = await UserForumActivities.create(
    req ? withTenantContext(req, data) : data
  );
  return result;
};

/**
 * Retrieves a user activity/comment by its unique ID, scoped to the tenant context.
 * 
 * @async
 * @function getCommentService
 * @param {string} commentId - The unique ID of the comment/activity.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Object|null>} The matching user activity document, or null if not found.
 */
module.exports.getCommentService = async (commentId, req = null) => {
  const query = { _id: commentId };
  // Optimization: Added .lean() for read-only query.
  // Optimization: Switched from .find() to .findOne() for fetching a single document by its unique ID.
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.userforumactivities.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await UserForumActivities.findOne(
    req ? withTenantFilter(req, query) : query
  ).lean();
  return result;
};

/**
 * Deletes a user activity/comment by its ID, scoped to the tenant context.
 * 
 * @async
 * @function deleteCommentServices
 * @param {string} id - The unique ID of the comment/activity to delete.
 * @param {import('express').Request|null} [req=null] - Express request object used for tenant isolation.
 * @returns {Promise<Object>} The delete operation result metadata.
 */
module.exports.deleteCommentServices = async (id, req = null) => {
  const query = { _id: id };
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.userforumactivities.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await UserForumActivities.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};