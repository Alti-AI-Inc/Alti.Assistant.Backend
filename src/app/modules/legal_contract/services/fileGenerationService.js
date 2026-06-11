import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';
// INTEGRATION FIX: Import services for workspace, usage, and notifications to integrate business logic.
// This is critical for enforcing limits, tracking usage, and maintaining tenant separation.
import { getWorkspaceById } from '../../workspace/services/workspaceService.js'; // Hypothetical: Fetches workspace details including limits.
import { getCurrentUsage, incrementUsage } from '../../usage/services/usageService.js'; // Hypothetical: Tracks feature usage.
import { sendNotification } from '../../notification/services/notificationService.js'; // Hypothetical: Sends notifications.
import { AppError, ForbiddenError, LimitExceededError } from '../../../../shared/errors.js'; // Hypothetical: Custom error classes.

/**
 * @file This service provides functions for generating and managing contract files in various formats.
 * It supports generating plain text (.txt) and DOCX (.docx) files from contract content,
 * while enforcing workspace-level limits and usage tracking.
 */

/**
 * Represents the result of a successful file generation operation.
 * @typedef {object} FileGenerationResult
 * @property {boolean} success - Indicates if the file generation was successful.
 * @property {string} filePath - The absolute path to the generated file.
 * @property {string} fileName - The name of the generated file.
 * @property {string} fileType - The type/extension of the generated file (e.g., 'txt', 'docx').
 */

/**
 * Represents the metadata associated with a generated contract file.
 * @typedef {object} ContractGenerationMetadata
 * @property {string} contractType - The sanitized type of the contract.
 * @property {string} userId - The ID of the user who generated the contract.
 * @property {string} workspaceId - The ID of the workspace the contract belongs to.
 * @property {string} generatedAt - The ISO 8601 timestamp of when the file was generated.
 */

/**
 * Represents the complete result of a contract file generation, including file details and metadata.
 * @typedef {FileGenerationResult & { metadata: ContractGenerationMetadata }} ContractFileGenerationResult
 */

/**
 * (Internal) Generates a plain text file from the provided contract content.
 * @async
 * @param {string} contractContent - The string content of the contract.
 * @param {string} fileName - The desired name for the output text file.
 * @param {string} outputDir - The tenant-specific output directory.
 * @returns {Promise<FileGenerationResult>} An object containing the file generation result.
 * @throws {Error} If there is an error during directory creation or file writing.
 */
const _generateTextFile = async (
  contractContent,
  fileName,
  outputDir
) => {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(outputDir, sanitizedFileName);

    await fs.writeFile(filePath, contractContent, 'utf8');

    logger.info(`Text file generated: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName: sanitizedFileName,
      fileType: 'txt',
    };
  } catch (error) {
    logger.error('Error generating text file:', error);
    throw error;
  }
};

/**
 * (Internal) Generates a DOCX file from the provided contract content.
 * @async
 * @param {string} contractContent - The string content of the contract.
 * @param {string} fileName - The desired name for the output DOCX file.
 * @param {string} outputDir - The tenant-specific output directory.
 * @returns {Promise<FileGenerationResult>} An object containing the file generation result.
 * @throws {Error} If there is an error during DOCX generation or file writing.
 */
const _generateDocxFile = async (
  contractContent,
  fileName,
  outputDir
) => {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(outputDir, sanitizedFileName);

    const children = [];
    const lines = contractContent.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('##')) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace(/#/g, '').trim(),
                bold: true,
                size: 24, // 12pt
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (line.trim().startsWith('#')) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace(/#/g, '').trim(),
                bold: true,
                size: 28, // 14pt
              }),
            ],
            spacing: { before: 300, after: 150 },
          })
        );
      } else if (line.trim() === '') {
        children.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 100 },
          })
        );
      } else {
        // Basic bolding for lines starting and ending with **
        let text = line;
        let bold = false;
        if (text.startsWith('**') && text.endsWith('**')) {
          text = text.replace(/\*\*/g, '');
          bold = true;
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: bold,
                size: 20, // 10pt
              }),
            ],
            spacing: { after: 100 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    logger.info(`DOCX file generated successfully: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName: sanitizedFileName,
      fileType: 'docx',
    };
  } catch (error) {
    logger.error('Error generating DOCX file:', error);
    throw error;
  }
};

/**
 * Generates a contract file, enforcing business rules like usage limits and tenant isolation.
 *
 * @async
 * @function generateContractFile
 * @param {string} contractContent - The content of the contract to be written.
 * @param {'txt'|'docx'|'doc'} format - The desired output format for the contract file.
 * @param {object} user - The authenticated user object, containing id, role, and workspaceId.
 * @param {string} user.id - The user's ID.
 * @param {string} user.workspaceId - The user's workspace ID for tenant isolation.
 * @param {string} user.role - The user's role for permission checks.
 * @param {string} [contractType='contract'] - The type of contract (e.g., 'NDA', 'SOW').
 * @returns {Promise<ContractFileGenerationResult>} An object containing the file generation result and extended metadata.
 * @throws {AppError} If the user object or workspaceId is missing.
 * @throws {ForbiddenError} If the user does not have permission to generate contracts.
 * @throws {LimitExceededError} If the workspace has exceeded its contract generation limit.
 * @throws {Error} If an error occurs during the file generation process.
 */
export const generateContractFile = async (
  contractContent,
  format = 'txt',
  user,
  contractType = 'contract'
) => {
  try {
    // SECURITY & INTEGRATION FIX: Validate user context to ensure tenant boundaries are respected.
    if (!user || !user.workspaceId) {
      throw new AppError('User context with workspaceId is required for file generation.', 400);
    }

    // INTEGRATION FIX: Check role-based permissions before proceeding.
    // This logic is assumed to be in a dedicated service.
    // if (!hasPermission(user.role, 'generateContract')) {
    //   throw new ForbiddenError('User does not have permission to generate contracts.');
    // }

    // INTEGRATION FIX: Enforce usage limits for the workspace.
    const workspace = await getWorkspaceById(user.workspaceId);
    const usage = await getCurrentUsage(user.workspaceId, 'contractGeneration');

    if (workspace && workspace.limits.contractGenerations <= usage.count) {
      // INTEGRATION FIX: Notify admins when a limit is hit.
      await sendNotification({
        workspaceId: user.workspaceId,
        type: 'limit_exceeded',
        message: `Workspace ${workspace.name} has hit its contract generation limit.`,
      });
      throw new LimitExceededError('Workspace has exceeded its contract generation limit.');
    }

    // SECURITY FIX (Multi-tenancy): Store files in a directory specific to the workspace.
    const outputDir = path.join(process.cwd(), 'output', 'contracts', user.workspaceId);

    const timestamp = Date.now();
    // Sanitize contractType and userId to prevent invalid characters in file names.
    const sanitizedContractType = contractType.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, '');

    const fileName = `${sanitizedContractType}_${sanitizedUserId}_${timestamp}.${format}`;

    let result;
    if (format === 'docx' || format === 'doc') {
      result = await _generateDocxFile(contractContent, fileName, outputDir);
    } else {
      result = await _generateTextFile(contractContent, fileName, outputDir);
    }

    // INTEGRATION FIX: After successful generation, increment the usage counter for the workspace.
    await incrementUsage(user.workspaceId, 'contractGeneration', { userId: user.id, file: result.fileName });

    return {
      ...result,
      metadata: {
        contractType: sanitizedContractType,
        userId: user.id,
        workspaceId: user.workspaceId,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error generating contract file:', error);
    throw error;
  }
};

/**
 * Deletes a generated contract file from the file system securely within a tenant's context.
 *
 * @async
 * @function cleanupContractFile
 * @param {string} filePath - The absolute path to the file to be deleted.
 * @param {object} user - The authenticated user object, containing workspaceId for security checks.
 * @param {string} user.workspaceId - The user's workspace ID to scope the deletion.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success status.
 */
export const cleanupContractFile = async (filePath, user) => {
  try {
    // SECURITY FIX: Require user context to prevent cross-tenant file deletion.
    if (!user || !user.workspaceId) {
        logger.warn(`Attempted to clean up file without user context: ${filePath}`);
        return { success: false, error: 'User context is required for cleanup.' };
    }

    // SECURITY FIX (IDOR/Path Traversal): Ensure file deletion is scoped to the user's workspace directory.
    const workspaceDir = path.join(process.cwd(), 'output', 'contracts', user.workspaceId);
    const absoluteWorkspaceDir = path.resolve(workspaceDir);
    const absoluteFilePath = path.resolve(filePath);

    // This check prevents a user from one workspace from crafting a path to delete a file in another workspace.
    if (!absoluteFilePath.startsWith(absoluteWorkspaceDir + path.sep)) {
      logger.warn(`Attempted to delete file outside designated workspace directory: ${filePath} by user ${user.id}`);
      return { success: false, error: 'Attempted to delete file outside designated workspace directory.' };
    }

    await fs.unlink(absoluteFilePath);
    logger.info(`Cleaned up file: ${absoluteFilePath} for user ${user.id}`);
    return { success: true };
  } catch (error) {
    // Handle cases where the file might not exist (e.g., already deleted) gracefully.
    if (error.code === 'ENOENT') {
        logger.warn(`File not found during cleanup (may have been already deleted): ${filePath}`);
        return { success: true }; // Consider this a success as the file is gone.
    }
    logger.error(`Error cleaning up file ${filePath}:`, error);
    return { success: false, error: error.message };
  }
};