import * as llama from './llamaindex.indexer.js';

const uploadAndIndexDocumentService = async (filePath, originalName, userId) => {
  return await llama.createIndexFromFile(filePath, originalName, userId);
};

const queryDocument = async (query, userId) => {
  return await llama.askQuery(query, userId);
};

export const ragService = {
  uploadAndIndexDocumentService,
  queryDocument,
};
