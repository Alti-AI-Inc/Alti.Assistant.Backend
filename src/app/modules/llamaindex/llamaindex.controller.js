import fs from 'node:fs/promises';
import { ragService } from './llamaindex.service.js';

export const uploadAndIndexDocument = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No files uploaded' });

    const filePaths = req.files.map(f => f.path);
    const result = await ragService.uploadAndIndexDocumentService(filePaths);

    // Optional: delete files after indexing
    await Promise.all(filePaths.map(p => fs.unlink(p)));

    res.status(200).json({ message: result.message, result });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({
          error: 'One or more files are too large. Max size is 1MB each.',
        });
    }
    res.status(500).json({ error: error.message });
  }
};

export const queryIndex = async (req, res) => {
  try {
    const { query } = req.body;
    const answer = await ragService.queryDocument(query);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
