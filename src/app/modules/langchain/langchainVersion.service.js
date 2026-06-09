import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainChainVersion from './langchain-version.model.js';

/**
 * Creates a prompt snapshot for a custom chain before any optimization or revision is performed.
 */
const createSnapshot = async (chainId, userId, changeSummary = 'Configuration snapshotted.') => {
  try {
    // Optimization Recommendation: Add an index on `userId` in the LangchainChain model for faster lookups.
    // Example: LangchainChainSchema.index({ userId: 1 });
    const chain = await LangchainChain.findOne({ _id: chainId, userId });
    if (!chain) {
      throw new Error(`LangChain chain not found: ${chainId}`);
    }

    // Find highest version number
    // Optimization Recommendation: Add a compound index on `{ chainId: 1, versionNumber: -1 }`
    // in the LangchainChainVersion model for efficient retrieval of the latest version.
    // Example: LangchainChainVersionSchema.index({ chainId: 1, versionNumber: -1 });
    const latestVersion = await LangchainChainVersion.findOne({ chainId })
      .sort({ versionNumber: -1 })
      .lean();

    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    const snapshot = new LangchainChainVersion({
      chainId,
      userId,
      versionNumber: nextVersionNumber,
      inputVariables: chain.inputVariables,
      outputVariables: chain.outputVariables,
      steps: chain.steps,
      changeSummary,
    });

    await snapshot.save();

    // Sync latest version count back to chain
    chain.version = nextVersionNumber;
    await chain.save();

    logger.info(`LangchainVersion: created snapshot v${nextVersionNumber} for chain ${chainId}`);
    return snapshot;
  } catch (err) {
    logger.error('LangchainVersion: failed to create snapshot:', err);
    throw err;
  }
};

/**
 * Restores a custom chain to a prior configuration snapshot version.
 */
const rollbackToVersion = async (chainId, versionNumber, userId) => {
  try {
    // Optimization Recommendation: Add an index on `userId` in the LangchainChain model for faster lookups.
    // Example: LangchainChainSchema.index({ userId: 1 });
    const chain = await LangchainChain.findOne({ _id: chainId, userId });
    if (!chain) {
      throw new Error(`LangChain chain not found: ${chainId}`);
    }

    // Optimization: Apply .lean() as this document is only read and not modified, reducing Mongoose overhead.
    // Optimization Recommendation: Add a compound index on `{ chainId: 1, versionNumber: 1 }`
    // in the LangchainChainVersion model for efficient lookup of specific versions.
    // Example: LangchainChainVersionSchema.index({ chainId: 1, versionNumber: 1 });
    const versionRecord = await LangchainChainVersion.findOne({ chainId, versionNumber }).lean();
    if (!versionRecord) {
      throw new Error(`Version snapshot v${versionNumber} not found for chain ${chainId}`);
    }

    // Take a snapshot of the current state before rolling back, in case they want to undo
    await createSnapshot(chainId, userId, `Pre-rollback snapshot before restoring v${versionNumber}.`);

    // Restore snapshots
    chain.inputVariables = versionRecord.inputVariables;
    chain.outputVariables = versionRecord.outputVariables;
    chain.steps = versionRecord.steps;
    await chain.save();

    logger.info(`LangchainVersion: successfully rolled back chain ${chainId} to version v${versionNumber}`);
    return {
      success: true,
      message: `LangChain custom chain rolled back successfully to version v${versionNumber}!`,
      chain,
    };
  } catch (err) {
    logger.error(`LangchainVersion: failed to rollback chain ${chainId} to v${versionNumber}:`, err);
    throw err;
  }
};

/**
 * Lists the version snapshots registry of a chain.
 */
const getVersionHistory = async (chainId, userId) => {
  try {
    // Optimization Recommendation: Add a compound index on `{ chainId: 1, userId: 1, versionNumber: -1 }`
    // in the LangchainChainVersion model for efficient history retrieval and sorting.
    // Example: LangchainChainVersionSchema.index({ chainId: 1, userId: 1, versionNumber: -1 });
    const history = await LangchainChainVersion.find({ chainId, userId })
      .sort({ versionNumber: -1 })
      .select('versionNumber changeSummary createdAt')
      .lean();

    return {
      success: true,
      chainId,
      history,
    };
  } catch (err) {
    logger.error(`LangchainVersion: failed to retrieve version history for chain ${chainId}:`, err);
    throw err;
  }
};

export const langchainVersionService = {
  createSnapshot,
  rollbackToVersion,
  getVersionHistory,
};