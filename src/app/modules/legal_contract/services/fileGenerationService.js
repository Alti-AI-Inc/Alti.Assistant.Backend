import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PubSub } from '@google-cloud/pubsub';

/**
 * @file This service provides functions for generating and managing contract files in various formats.
 * Heavy file generation tasks are offloaded asynchronously via GCP Pub/Sub to ensure the main application remains responsive.
 */

// Initialize the Google Cloud Pub/Sub client.
// This will automatically use the service account credentials available in the environment.
const pubsub = new PubSub();
// The name of the Pub/Sub topic to which contract generation requests will be published.
// It's recommended to configure this via environment variables.
const contractGenerationTopicName = process.env.CONTRACT_GENERATION_TOPIC || 'contract-generation-requests';


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
 * @property {string} userId - The sanitized ID of the user who generated the contract.
 * @property {string} generatedAt - The ISO 8601 timestamp of when the file was generated.
 */

/**
 * Represents the complete result of a contract file generation, including file details and metadata.
 * @typedef {FileGenerationResult & { metadata: ContractGenerationMetadata }} ContractFileGenerationResult
 */

/**
 * Represents the payload for a contract generation request sent via Pub/Sub.
 * @typedef {object} ContractGenerationPayload
 * @property {string} contractContent - The string content of the contract to be written to the file.
 * @property {'txt'|'docx'|'doc'} [format='txt'] - The desired output format for the contract file.
 * @property {object} [metadata={}] - Additional metadata to include in the file name and return object.
 * @property {string} [metadata.contractType='contract'] - The type of contract (e.g., 'NDA', 'SOW'). Used in file name.
 * @property {string} [metadata.userId='anonymous'] - The ID of the user generating the contract. Used in file name.
 */


/**
 * [WORKER] Generates a plain text file from the provided contract content.
 * This is a synchronous, blocking operation intended to be executed by a background worker, not the main API thread.
 * The file will be saved in a designated output directory.
 *
 * @async
 * @function generateTextFile
 * @param {string} contractContent - The string content of the contract to be written to the file.
 * @param {string} [fileName='contract.txt'] - The desired name for the output text file.
 * @returns {Promise<FileGenerationResult>} An object containing the success status, file path, file name, and file type.
 * @throws {Error} If there is an error during directory creation or file writing.
 */
export const generateTextFile = async (
  contractContent,
  fileName = 'contract.txt'
) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Sanitize fileName to prevent path traversal vulnerabilities by ensuring only the basename is used.
    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(outputDir, sanitizedFileName);

    // Write contract to file
    await fs.writeFile(filePath, contractContent, 'utf8');

    logger.info(`Text file generated: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName: sanitizedFileName, // Return the sanitized file name
      fileType: 'txt',
    };
  } catch (error) {
    logger.error('Error generating text file:', error);
    throw error;
  }
};

/**
 * [WORKER] Generates a DOCX (Microsoft Word) file from the provided contract content.
 * This is a CPU and memory-intensive operation that should be executed by a background worker.
 * The content is parsed to apply basic formatting like headings (using # and ##) and bold text (using **text**).
 * The file will be saved in a designated output directory.
 *
 * @async
 * @function generateDocxFile
 * @param {string} contractContent - The string content of the contract, potentially with markdown-like formatting.
 * @param {string} [fileName='contract.docx'] - The desired name for the output DOCX file.
 * @returns {Promise<FileGenerationResult>} An object containing the success status, file path, file name, and file type.
 * @throws {Error} If there is an error during directory creation, DOCX generation, or file writing.
 */
export const generateDocxFile = async (
  contractContent,
  fileName = 'contract.docx'
) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Sanitize fileName to prevent path traversal vulnerabilities by ensuring only the basename is used.
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
      fileName: sanitizedFileName, // Return the sanitized file name
      fileType: 'docx',
    };
  } catch (error) {
    logger.error('Error generating DOCX file:', error);
    throw error;
  }
};

/**
 * [API-FACING] Asynchronously requests the generation of a contract file by publishing a message to GCP Pub/Sub.
 * This function does not perform the file generation itself but offloads it to a background worker.
 * This ensures the API remains non-blocking and responsive.
 *
 * @async
 * @function generateContractFile
 * @param {string} contractContent - The content of the contract.
 * @param {'txt'|'docx'|'doc'} [format='txt'] - The desired output format.
 * @param {object} [metadata={}] - Additional metadata.
 * @param {string} [metadata.contractType='contract'] - The type of contract.
 * @param {string} [metadata.userId='anonymous'] - The ID of the user.
 * @returns {Promise<{success: boolean, messageId: string, status: string}>} An object confirming the request was queued.
 * @throws {Error} If publishing to Pub/Sub fails.
 */
export const generateContractFile = async (
  contractContent,
  format = 'txt',
  metadata = {}
) => {
  try {
    const payload = {
      contractContent,
      format,
      metadata,
    };

    const dataBuffer = Buffer.from(JSON.stringify(payload));

    const messageId = await pubsub
      .topic(contractGenerationTopicName)
      .publishMessage({ data: dataBuffer });

    logger.info(
      `Contract generation request queued with Message ID: ${messageId} to topic ${contractGenerationTopicName}.`
    );

    return {
      success: true,
      messageId,
      status: 'queued',
    };
  } catch (error) {
    logger.error(
      `Failed to publish contract generation request to Pub/Sub topic ${contractGenerationTopicName}:`,
      error
    );
    // Re-throw the error so the calling service (e.g., an Express controller) can handle it.
    throw new Error('Failed to queue contract generation task.');
  }
};

/**
 * [WORKER] Processes a contract generation request received from a Pub/Sub subscription.
 * This function is the entry point for a background worker (e.g., a Cloud Function or a dedicated service).
 * It parses the message payload and executes the appropriate file generation logic.
 *
 * @async
 * @function processContractGenerationRequest
 * @param {ContractGenerationPayload} payload - The deserialized data from the Pub/Sub message.
 * @returns {Promise<ContractFileGenerationResult>} An object containing the file generation result and extended metadata.
 * @throws {Error} If an error occurs during the file generation process.
 */
export const processContractGenerationRequest = async (payload) => {
  const { contractContent, format = 'txt', metadata = {} } = payload;
  try {
    const timestamp = Date.now();
    // Sanitize contractType and userId to prevent invalid characters or path traversal attempts in file names.
    // Allow only alphanumeric characters, hyphens, and underscores.
    const contractType = (metadata.contractType || 'contract').replace(/[^a-zA-Z0-9_-]/g, '');
    const userId = (metadata.userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '');

    const fileName = `${contractType}_${userId}_${timestamp}.${format}`;

    let result;

    if (format === 'docx' || format === 'doc') {
      result = await generateDocxFile(contractContent, fileName);
    } else {
      result = await generateTextFile(contractContent, fileName);
    }

    const finalResult = {
      ...result,
      metadata: {
        contractType,
        userId,
        generatedAt: new Date().toISOString(),
      },
    };

    // In a real-world scenario, the worker would now perform follow-up actions, such as:
    // 1. Uploading the generated file to a persistent store like Google Cloud Storage.
    // 2. Updating a database record with the file's location.
    // 3. Deleting the local file from the worker's filesystem.
    // 4. Publishing another message (e.g., to a 'contract-generated' topic) for user notification.
    logger.info(`Successfully processed contract generation for user ${userId}. File created at: ${result.filePath}`);

    return finalResult;
  } catch (error) {
    logger.error('Error processing contract generation request:', error);
    throw error;
  }
};


/**
 * Deletes a generated contract file from the file system.
 * This function includes a security check to prevent path traversal attacks, ensuring
 * that only files within the designated 'output/contracts' directory can be deleted.
 *
 * @async
 * @function cleanupContractFile
 * @param {string} filePath - The absolute path to the file to be deleted.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success status and an error message if deletion failed.
 */
export const cleanupContractFile = async (filePath) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');
    const absoluteOutputDir = path.resolve(outputDir);
    const absoluteFilePath = path.resolve(filePath);

    // Security check: Prevent path traversal (IDOR) by ensuring the file to be deleted
    // is strictly within the designated contract output directory.
    // We add path.sep to ensure it's a child of the directory, not just a string prefix match.
    if (!absoluteFilePath.startsWith(absoluteOutputDir + path.sep)) {
      logger.warn(`Attempted to delete file outside designated contract directory: ${filePath}`);
      return { success: false, error: 'Attempted to delete file outside designated contract directory.' };
    }

    await fs.unlink(filePath);
    logger.info(`Cleaned up file: ${filePath}`);
    return { success: true };
  } catch (error) {
    logger.error('Error cleaning up file:', error);
    return { success: false, error: error.message };
  }
};