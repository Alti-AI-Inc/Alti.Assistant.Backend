import httpStatus from 'http-status';
import { ComposioCatalogService } from './composio-catalog.service.js';

const getRepositories = async (req, res, next) => {
  try {
    const { query, license, language, limit, page, sortBy } = req.query;
    // Optimization Recommendation:
    // For read-only operations like this, ensure the 'searchComposioCatalog'
    // method in ComposioCatalogService uses .lean() on its Mongoose queries
    // to return plain JavaScript objects instead of Mongoose documents.
    // This reduces overhead if no Mongoose document methods are needed.
    //
    // Indexing Recommendation:
    // To improve query performance, ensure that the underlying Mongoose schema
    // for the ComposioCatalog model has indexes on 'license', 'language', and
    // 'sortBy' fields. If 'query' is used for text search, consider a text index.
    // For 'sortBy', a compound index with other query fields might be beneficial.
    const result = await ComposioCatalogService.searchComposioCatalog(query, {
      license,
      language,
      limit,
      page,
      sortBy
    });
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    // Optimization Recommendation:
    // For read-only operations like this, ensure the 'getComposioStats'
    // method in ComposioCatalogService uses .lean() on its Mongoose queries
    // or aggregation pipelines to return plain JavaScript objects.
    // This reduces overhead if no Mongoose document methods are needed.
    //
    // Indexing Recommendation:
    // If 'getComposioStats' involves aggregation or filtering on specific fields,
    // ensure those fields are indexed in the underlying Mongoose schema to
    // optimize aggregation performance.
    const result = await ComposioCatalogService.getComposioStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const importSubmodule = async (req, res, next) => {
  try {
    const { repoName } = req.body;
    // Indexing Recommendation:
    // If 'importComposioSubmodule' uses 'repoName' to find an existing document
    // before creating or updating, ensure the underlying Mongoose schema for
    // the ComposioCatalog model has an index on the 'repoName' field for faster lookups.
    const result = await ComposioCatalogService.importComposioSubmodule(repoName);
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
      res.status(httpStatus.BAD_REQUEST).json(result);
    }
  } catch (error) {
    next(error);
  }
};

export const ComposioCatalogController = {
  getRepositories,
  getStats,
  importSubmodule
};