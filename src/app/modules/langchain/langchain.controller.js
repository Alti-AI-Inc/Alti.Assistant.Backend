import httpStatus from 'http-status';
import { LangchainService } from './langchain.service.js';
import { LangchainExecutionService } from './langchainExecution.service.js';
import { langchainOptimizerService } from './langchainOptimizer.service.js';
import { langchainVersionService } from './langchainVersion.service.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';

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

// ── LCEL Custom Chain Registry & Execution Endpoints ────────────────────────

const createChain = async (req, res, next) => {
  try {
    const { name, description, inputVariables, outputVariables, steps, changeSummary } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    // Check if the chain already exists; if so, snapshot it first before overwriting
    const existingChain = await LangchainChain.findOne({ userId, name });
    if (existingChain) {
      await langchainVersionService.createSnapshot(
        existingChain._id,
        userId,
        changeSummary || `Version backup before edit mapping.`
      );
    }

    const newChain = await LangchainChain.findOneAndUpdate(
      { userId, name },
      { description, inputVariables, outputVariables, steps },
      { new: true, upsert: true }
    );

    // If it's a completely new chain, create the initial snapshot v1
    if (!existingChain) {
      await langchainVersionService.createSnapshot(
        newChain._id,
        userId,
        'Initial version v1 registered.'
      );
    }

    res.status(httpStatus.CREATED).json({
      success: true,
      message: `LangChain Expression Language (LCEL) chain "${name}" registered successfully!`,
      chain: newChain,
    });
  } catch (error) {
    next(error);
  }
};

const listChains = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const chains = await LangchainChain.find({ userId, isActive: true });
    res.status(httpStatus.OK).json({ success: true, chains });
  } catch (error) {
    next(error);
  }
};

const runChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const { inputs } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const executionRecord = await LangchainExecutionService.executeChain(chainId, inputs || {}, userId);
    res.status(httpStatus.OK).json({
      success: true,
      message: 'LangChain custom chain executed successfully!',
      execution: executionRecord,
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `LangChain execution failed: ${error.message}`,
    });
  }
};

const getExecutions = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const executions = await LangchainExecution.find({ chainId, userId }).sort({ createdAt: -1 }).limit(50);
    res.status(httpStatus.OK).json({ success: true, executions });
  } catch (error) {
    next(error);
  }
};

const optimizeChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    // Auto-create snapshot of current settings before optimizations apply
    await langchainVersionService.createSnapshot(
      chainId,
      userId,
      `Version backup before trace diagnostics optimization.`
    );

    const result = await langchainOptimizerService.optimizeChain(chainId, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const rollbackChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const { versionNumber } = req.body;
    if (!versionNumber) {
      return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'versionNumber is required' });
    }
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const result = await langchainVersionService.rollbackToVersion(chainId, versionNumber, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

const getChainVersions = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const result = await langchainVersionService.getVersionHistory(chainId, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

export const LangchainController = {
  getRepositories,
  getStats,
  importSubmodule,
  createChain,
  listChains,
  runChain,
  getExecutions,
  optimizeChain,
  rollbackChain,
  getChainVersions,
};
