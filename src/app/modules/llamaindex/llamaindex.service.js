import * as llama from './llamaindex.indexer.js';

const uploadAndIndexDocumentService = async (filePath) => {
  return await llama.createIndexFromFile(filePath);
};

const queryDocument = async query => {
  return await llama.askQuery(query);
};

export const ragService = {
  uploadAndIndexDocumentService,
  queryDocument,
};
