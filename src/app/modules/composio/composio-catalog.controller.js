import httpStatus from 'http-status';
import { ComposioCatalogService } from './composio-catalog.service.js';

const getRepositories = async (req, res, next) => {
  try {
    const { query, license, language, limit, page, sortBy } = req.query;
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
    const result = await ComposioCatalogService.getComposioStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const importSubmodule = async (req, res, next) => {
  try {
    const { repoName } = req.body;
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
