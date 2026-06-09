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

  const forumData = await Forum.find(finalQuery)
    .populate('author')
    .populate('userActivities')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

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
  const result = await Forum.findOne(
    req ? withTenantFilter(req, query) : query
  );
  // logger.info(result, 'resultt blog details') // Commented out as logger is not defined in this scope
  return result;
};

module.exports.getForumServiceByEmail = async (email, req = null) => {
  const query = { authorEmail: email };
  const result = await Forum.find(req ? withTenantFilter(req, query) : query);
  // logger.info(result, 'resultt blog details') // Commented out as logger is not defined in this scope
  return result;
};

module.exports.updateForumService = async (id, data, req = null) => { // Renamed storeId to id for consistency
  const query = { _id: id };
  const result = await Forum.updateOne(
    req ? withTenantFilter(req, query) : query,
    { $set: data },
    { runValidators: true }
  );

  return result;
};

exports.deleteForumService = async (id, req = null) => {
  const query = { _id: id };
  const result = await Forum.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};

module.exports.getForumSuggestionService = async (name, req = null) => {
  const query = { category: name };
  const result = await Forum.find(
    req ? withTenantFilter(req, query) : query
  ).limit(3);
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
  const result = await UserForumActivities.find(
    req ? withTenantFilter(req, query) : query
  );
  // logger.info(result, "commentssssssss") // Commented out as logger is not defined in this scope
  return result;
};

module.exports.deleteCommentServices = async (id, req = null) => {
  const query = { _id: id };
  const result = await UserForumActivities.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};