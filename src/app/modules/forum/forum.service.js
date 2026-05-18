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

  const productsSearchAbleFields = ['title', 'category'];
  const andConditions = [];

  // Add a default condition if andConditions is empty
  if (andConditions.length === 0) {
    andConditions.push({});
  }

  if (searchTerm) {
    andConditions.push({
      $or: productsSearchAbleFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  // if (Object.keys(filtersData).length) {
  //     andConditions.push({
  //         $and: Object.entries(filtersData).map(([field, value]) => ({
  //             [field]: value,
  //         })),
  //     });
  // }

  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  }

  const baseQuery = { $and: andConditions };
  const forumData = await Forum.find(
    req ? withTenantFilter(req, baseQuery) : baseQuery
  )
    .populate('author')
    .populate('userActivities')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  // logger.info(blogData)
  const countQuery = req ? withTenantFilter(req, {}) : {};
  const total = await Forum.countDocuments(countQuery);
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
  // logger.info(data, 'blog dataaa')
  const result = await Forum.create(req ? withTenantContext(req, data) : data);
  // logger.info(result, "dataasss")
  return result;
};

module.exports.getForumServiceById = async (id, req = null) => {
  const query = { _id: id };
  const result = await Forum.findOne(
    req ? withTenantFilter(req, query) : query
  );
  // logger.info(result, 'resultt blog details')
  return result;
};

module.exports.getForumServiceByEmail = async (email, req = null) => {
  const query = { authorEmail: email };
  const result = await Forum.find(req ? withTenantFilter(req, query) : query);
  // logger.info(result, 'resultt blog details')
  return result;
};

module.exports.updateForumService = async (storeId, data, req = null) => {
  const query = { _id: storeId };
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
  logger.info(data, 'dataaaaa');

  const result = await UserForumActivities.create(
    req ? withTenantContext(req, data) : data
  );
  // logger.info(result, "resulttttt comment")
  return result;
};

module.exports.getCommnetService = async (commentId, req = null) => {
  // logger.info(commentId, "commentId")
  const query = { id: commentId };
  const result = await UserForumActivities.find(
    req ? withTenantFilter(req, query) : query
  );
  // logger.info(result, "commentssssssss")
  return result;
};

module.exports.deleteCommentServices = async (id, req = null) => {
  const query = { _id: id };
  const result = await UserForumActivities.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};
