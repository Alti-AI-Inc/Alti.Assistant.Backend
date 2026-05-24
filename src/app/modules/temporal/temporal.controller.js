import httpStatus from 'http-status';
import { TemporalCatalogService } from './temporal-catalog.service.js';

const getRepositories = async (req, res, next) => {
  try {
    const { query, license, status, limit, page, sortBy } = req.query;
    const result = await TemporalCatalogService.searchCatalog(query, {
      license,
      status,
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
    const result = await TemporalCatalogService.getStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const syncCatalog = async (req, res, next) => {
  try {
    const result = await TemporalCatalogService.syncCatalog();
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
      res.status(httpStatus.BAD_REQUEST).json(result);
    }
  } catch (error) {
    next(error);
  }
};

export const TemporalController = {
  getRepositories,
  getStats,
  syncCatalog
};
