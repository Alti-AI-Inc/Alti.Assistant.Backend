import * as llama from './llamaindex.indexer.js';

const uploadAndIndexDocumentService = async (filePath, originalName) => {
  return await llama.createIndexFromFile(filePath, originalName);
};

const queryDocument = async (query) => {
  return await llama.askQuery(query);
};

export const ragService = {
  uploadAndIndexDocumentService,
  queryDocument,
};
