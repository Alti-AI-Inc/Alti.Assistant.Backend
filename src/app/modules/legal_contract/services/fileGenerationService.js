import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';

/**
 * Generate a text file from contract content
 */
export const generateTextFile = async (
  contractContent,
  fileName = 'contract.txt'
) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, fileName);

    // Write contract to file
    await fs.writeFile(filePath, contractContent, 'utf8');

    logger.info(`Text file generated: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName,
      fileType: 'txt',
    };
  } catch (error) {
    logger.error('Error generating text file:', error);
    throw error;
  }
};

/**
 * Generate a DOCX file from contract content
 * Note: For now, we'll use text format. Full DOCX support requires docx library
 */
export const generateDocxFile = async (
  contractContent,
  fileName = 'contract.docx'
) => {
  try {
    // For now, create a simple text file
    // TODO: Integrate with 'docx' library for proper DOCX generation
    const txtFileName = fileName.replace('.docx', '.txt');
    const result = await generateTextFile(contractContent, txtFileName);

    logger.warn(
      'DOCX generation not fully implemented. Generated TXT file instead.'
    );

    return {
      ...result,
      fileType: 'txt',
      message: 'DOCX format not yet supported. Generated as TXT.',
    };
  } catch (error) {
    logger.error('Error generating DOCX file:', error);
    throw error;
  }
};

/**
 * Generate contract file based on format
 */
export const generateContractFile = async (
  contractContent,
  format = 'txt',
  metadata = {}
) => {
  try {
    const timestamp = Date.now();
    const contractType = metadata.contractType || 'contract';
    const userId = metadata.userId || 'anonymous';

    const fileName = `${contractType}_${timestamp}.${format}`;

    let result;

    if (format === 'docx' || format === 'doc') {
      result = await generateDocxFile(contractContent, fileName);
    } else {
      result = await generateTextFile(contractContent, fileName);
    }

    return {
      ...result,
      metadata: {
        contractType,
        userId,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error generating contract file:', error);
    throw error;
  }
};

/**
 * Clean up generated file
 */
export const cleanupContractFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`Cleaned up file: ${filePath}`);
    return { success: true };
  } catch (error) {
    logger.error('Error cleaning up file:', error);
    return { success: false, error: error.message };
  }
};
