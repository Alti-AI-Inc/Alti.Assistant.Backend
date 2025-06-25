import fs from 'node:fs/promises';
import { ragService } from './llamaindex.service.js';

export const uploadAndIndexDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const result = await ragService.uploadAndIndexDocumentService(filePath);

    // Optional: delete temp file
    await fs.unlink(filePath);

    res.status(200).json({ message: 'Document indexed', result });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({ error: 'File too large. Maximum allowed size is 1MB.' });
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
