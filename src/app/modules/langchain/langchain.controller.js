import httpStatus from 'http-status';
import { LangchainService } from './langchain.service.js';

const getRepositories = async (req, res, next) => {
  try {
    const { query, license, language, limit, page, sortBy } = req.query;
    const result = await LangchainService.searchLangchainCatalog(query, {
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
    const result = await LangchainService.getLangchainStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const importSubmodule = async (req, res, next) => {
  try {
    const { repoName } = req.body;
    const result = await LangchainService.importLangchainSubmodule(repoName);
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
      res.status(httpStatus.BAD_REQUEST).json(result);
    }
  } catch (error) {
    next(error);
  }
};

export const LangchainController = {
  getRepositories,
  getStats,
  importSubmodule
};
