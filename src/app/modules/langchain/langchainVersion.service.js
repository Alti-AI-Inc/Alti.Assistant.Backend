import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainChainVersion from './langchain-version.model.js';

/**
 * Creates a prompt snapshot for a custom chain before any optimization or revision is performed.
 * This function captures the current state of a Langchain chain, including its input variables,
 * output variables, and steps, and saves it as a new version. It also updates the parent chain
 * with the new latest version number.
 *
 * @param {string} chainId - The unique identifier of the Langchain chain to snapshot.
 * @param {string} userId - The unique identifier of the user performing the action.
 * @param {string} [changeSummary='Configuration snapshotted.'] - A brief summary of the changes or reason for the snapshot.
 * @returns {Promise<import('./langchain-version.model').LangchainChainVersionDocument>} A promise that resolves to the newly created LangchainChainVersion document.
 * @throws {Error} If the Langchain chain is not found or if there's an issue saving the snapshot.
 */
const createSnapshot = async (chainId, userId, changeSummary = 'Configuration snapshotted.') => {
  try {
    // Optimization: Use .lean() for this read-only operation to improve performance by returning a plain
    // JavaScript object instead of a full Mongoose document, reducing memory overhead.
    // Optimization Recommendation: Add an index on `userId` in the LangchainChain model for faster lookups,
    // although the primary filter on `_id` is already highly efficient.
    // Example: LangchainChainSchema.index({ userId: 1 });
    const chain = await LangchainChain.findOne({ _id: chainId, userId }).lean();
    if (!chain) {
      throw new Error(`LangChain chain not found: ${chainId}`);
    }

    // Find highest version number
    // Optimization Recommendation: Add a compound index on `{ chainId: 1, versionNumber: -1 }`
    // in the LangchainChainVersion model for efficient retrieval of the latest version.
    // Example: LangchainChainVersionSchema.index({ chainId: 1, versionNumber: -1 });
    const latestVersion = await LangchainChainVersion.findOne({ chainId })
      .sort({ versionNumber: -1 })
      .lean(); // Optimization: Use .lean() for faster, read-only queries.

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

    // Important: For data integrity and to prevent duplicate version numbers under concurrent access,
    // the LangchainChainVersion model MUST have a unique compound index on `{ chainId: 1, versionNumber: 1 }`.
    // If this index is missing, concurrent calls could create multiple snapshots with the same versionNumber,
    // leading to data corruption. With the index, concurrent attempts to save the same versionNumber will
    // result in a duplicate key error, which is caught and re-thrown here.
    await snapshot.save();

    // Sync latest version count back to chain
    // BUG FIX & OPTIMIZATION: The previous direct assignment `chain.version = nextVersionNumber; await chain.save();`
    // was susceptible to race conditions. If multiple snapshots were created concurrently,
    // a lower version number could overwrite a higher one if their `chain.save()` operations interleaved.
    // This `findOneAndUpdate` atomically updates the `version` field only if `nextVersionNumber`
    // is greater than the currently stored `chain.version`, ensuring the `version` field always
    // reflects the highest successfully created snapshot version.
    await LangchainChain.findOneAndUpdate(
      { _id: chainId, userId, version: { $lt: nextVersionNumber } },
      { $set: { version: nextVersionNumber } }
    );

    logger.info({
      severity: 'INFO', // Added for GCP Cloud Logging structured log compatibility
      message: `LangchainVersion: created snapshot v${nextVersionNumber} for chain ${chainId}`,
      service: 'langchainVersionService',
      method: 'createSnapshot',
      chainId,
      versionNumber: nextVersionNumber,
      userId,
    });
    return snapshot;
  } catch (err) {
    logger.error({
      severity: 'ERROR', // Added for GCP Cloud Logging structured log compatibility
      message: `LangchainVersion: failed to create snapshot for chain ${chainId}`,
      service: 'langchainVersionService',
      method: 'createSnapshot',
      chainId,
      userId,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
    });
    throw err;
  }
};

/**
 * Restores a custom chain to a prior configuration snapshot version.
 * This function retrieves a specific version of a Langchain chain's configuration
 * and applies it to the active chain. It also creates a snapshot of the current
 * state *before* the rollback for potential undo operations.
 *
 * @param {string} chainId - The unique identifier of the Langchain chain to rollback.
 * @param {number} versionNumber - The specific version number to restore the chain to.
 * @param {string} userId - The unique identifier of the user performing the action.
 * @returns {Promise<{success: boolean, message: string, chain: import('./langchain-chain.model').LangchainChainDocument}>} A promise that resolves to an object indicating success, a message, and the updated chain document.
 * @throws {Error} If the Langchain chain or the specified version snapshot is not found, or if there's an issue during the rollback.
 */
const rollbackToVersion = async (chainId, versionNumber, userId) => {
  try {
    // Optimization Recommendation: Add an index on `userId` in the LangchainChain model for faster lookups.
    // Example: LangchainChainSchema.index({ userId: 1 });
    // Note: .lean() is NOT used here because the 'chain' document is modified and saved.
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
    // If this snapshot fails, the rollback operation will be aborted, which is desired behavior.
    await createSnapshot(chainId, userId, `Pre-rollback snapshot before restoring v${versionNumber}.`);

    // Restore snapshots
    chain.inputVariables = versionRecord.inputVariables;
    chain.outputVariables = versionRecord.outputVariables;
    chain.steps = versionRecord.steps;
    await chain.save();

    logger.info({
      severity: 'INFO', // Added for GCP Cloud Logging structured log compatibility
      message: `LangchainVersion: successfully rolled back chain ${chainId} to version v${versionNumber}`,
      service: 'langchainVersionService',
      method: 'rollbackToVersion',
      chainId,
      versionNumber,
      userId,
    });
    return {
      success: true,
      message: `LangChain custom chain rolled back successfully to version v${versionNumber}!`,
      chain,
    };
  } catch (err) {
    logger.error({
      severity: 'ERROR', // Added for GCP Cloud Logging structured log compatibility
      message: `LangchainVersion: failed to rollback chain ${chainId} to v${versionNumber}`,
      service: 'langchainVersionService',
      method: 'rollbackToVersion',
      chainId,
      versionNumber,
      userId,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
    });
    throw err;
  }
};

/**
 * Lists the version snapshots registry of a specific Langchain chain.
 * This function retrieves a history of all snapshots for a given chain,
 * including their version numbers, change summaries, and creation timestamps.
 *
 * @param {string} chainId - The unique identifier of the Langchain chain to retrieve history for.
 * @param {string} userId - The unique identifier of the user requesting the history.
 * @returns {Promise<{success: boolean, chainId: string, history: Array<{versionNumber: number, changeSummary: string, createdAt: Date}>}>} A promise that resolves to an object containing success status, the chain ID, and an array of version history records.
 * @throws {Error} If there's an issue retrieving the version history.
 */
const getVersionHistory = async (chainId, userId) => {
  try {
    // Optimization Recommendation: Add a compound index on `{ chainId: 1, userId: 1, versionNumber: -1 }`
    // in the LangchainChainVersion model for efficient history retrieval and sorting.
    // Example: LangchainChainVersionSchema.index({ chainId: 1, userId: 1, versionNumber: -1 });
    const history = await LangchainChainVersion.find({ chainId, userId })
      .sort({ versionNumber: -1 })
      .select('versionNumber changeSummary createdAt')
      .lean(); // Optimization: Use .lean() for faster, read-only queries.

    return {
      success: true,
      chainId,
      history,
    };
  } catch (err) {
    logger.error({
      severity: 'ERROR', // Added for GCP Cloud Logging structured log compatibility
      message: `LangchainVersion: failed to retrieve version history for chain ${chainId}`,
      service: 'langchainVersionService',
      method: 'getVersionHistory',
      chainId,
      userId,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
    });
    throw err;
  }
};

/**
 * @constant
 * @type {object}
 * @description Provides a collection of services for managing Langchain chain versions,
 * including creating snapshots, rolling back to previous versions, and retrieving version history.
 */
export const langchainVersionService = {
  createSnapshot,
  rollbackToVersion,
  getVersionHistory,
};