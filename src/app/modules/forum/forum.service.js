const paginationHelpers = require('../../helpers/paginationHelpers');
const Forum = require('./forum.model');
const UserForumActivities = require('./forumUserActivities.model');
const {
  withTenantContext,
  withTenantFilter,
} = require('../../helpers/tenantQuery');

module.exports.getForumService = async (
  filters,
  paginationOptions,
  req = null
) => {
  const { searchTerm, ...filtersData } = filters;

  // Renamed for clarity, as it's used for forum search
  const forumSearchableFields = ['title', 'category'];
  const andConditions = [];

  // Removed redundant condition: if no other conditions, an empty $and array is equivalent to {}
  // and will return all documents, which is the desired behavior when no filters are applied.

  if (searchTerm) {
    andConditions.push({
      $or: forumSearchableFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  // Uncommented and enabled filtering by other fields
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

  // Construct the base query for both finding documents and counting them
  const baseQuery = andConditions.length > 0 ? { $and: andConditions } : {};
  const finalQuery = req ? withTenantFilter(req, baseQuery) : baseQuery;

  // Optimization: Added .lean() for read-only queries to return plain JavaScript objects,
  // improving performance by skipping Mongoose document instantiation.
  // Indexing Recommendation:
  // - For 'searchTerm' on 'title' and 'category': Consider creating indexes on 'title' and 'category'
  //   or a text index if full-text search capabilities are desired.
  //   Example: `db.forums.createIndex({ title: 1, category: 1 })`
  // - For 'filtersData' fields: Ensure fields used in filtersData (e.g., 'authorId', 'status') are indexed.
  //   Example: `db.forums.createIndex({ authorId: 1 })`
  // - For 'sortBy' field: Ensure the field used for sorting (e.g., 'createdAt', 'updatedAt') is indexed.
  //   Example: `db.forums.createIndex({ createdAt: -1 })`
  // - If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed, potentially as a compound index
  //   with other frequently queried fields (e.g., `db.forums.createIndex({ tenantId: 1, category: 1 })`).
  const forumData = await Forum.find(finalQuery)
    .populate('author')
    .populate('userActivities')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit)
    .lean(); // Added .lean()

  // Fixed: total count should reflect the applied filters and search term
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

module.exports.addForumServices = async (data, req = null) => {
  // logger.info(data, 'blog dataaa') // Commented out as logger is not defined in this scope
  const result = await Forum.create(req ? withTenantContext(req, data) : data);
  // logger.info(result, "dataasss") // Commented out as logger is not defined in this scope
  return result;
};

module.exports.getForumServiceById = async (id, req = null) => {
  const query = { _id: id };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await Forum.findOne(
    req ? withTenantFilter(req, query) : query
  ).lean(); // Added .lean()
  // logger.info(result, 'resultt blog details') // Commented out as logger is not defined in this scope
  return result;
};

module.exports.getForumServiceByEmail = async (email, req = null) => {
  const query = { authorEmail: email };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: Create an index on 'authorEmail' for efficient lookup.
  // Example: `db.forums.createIndex({ authorEmail: 1 })`
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, authorEmail: 1 })`.
  const result = await Forum.find(req ? withTenantFilter(req, query) : query).lean(); // Added .lean()
  // logger.info(result, 'resultt blog details') // Commented out as logger is not defined in this scope
  return result;
};

module.exports.updateForumService = async (id, data, req = null) => { // Renamed storeId to id for consistency
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

module.exports.getForumSuggestionService = async (name, req = null) => {
  const query = { category: name };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: Create an index on 'category' for efficient lookup.
  // Example: `db.forums.createIndex({ category: 1 })`
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.forums.createIndex({ tenantId: 1, category: 1 })`.
  const result = await Forum.find(
    req ? withTenantFilter(req, query) : query
  ).limit(3).lean(); // Added .lean()
  return result;
};

module.exports.addUserForumActivityServices = async (data, req = null) => {
  // Check if the user already has a store
  // const existingStore = await Blogs.findOne({ email: email });

  // if (existingStore) {
  //     return { error: 'One user can add one comment' };
  // }
  // Removed logger.info as logger is not defined in this scope.
  // logger.info(data, 'dataaaaa');

  const result = await UserForumActivities.create(
    req ? withTenantContext(req, data) : data
  );
  // logger.info(result, "resulttttt comment") // Commented out as logger is not defined in this scope
  return result;
};

module.exports.getCommentService = async (commentId, req = null) => { // Fixed typo: getCommnetService -> getCommentService
  // logger.info(commentId, "commentId") // Commented out as logger is not defined in this scope
  // Fixed: Assuming _id is the primary key for comments
  const query = { _id: commentId };
  // Optimization: Added .lean() for read-only query.
  // Indexing Recommendation: '_id' is automatically indexed by MongoDB.
  // If 'withTenantFilter' adds a 'tenantId' field, ensure it's indexed,
  // e.g., `db.userforumactivities.createIndex({ tenantId: 1, _id: 1 })`.
  const result = await UserForumActivities.find(
    req ? withTenantFilter(req, query) : query
  ).lean(); // Added .lean()
  // logger.info(result, "commentssssssss") // Commented out as logger is not defined in this scope
  return result;
};

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