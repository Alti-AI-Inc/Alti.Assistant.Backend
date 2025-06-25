import { openai, OpenAIEmbedding } from '@llamaindex/openai';
import { Document, MetadataMode, Settings, VectorStoreIndex } from 'llamaindex';
import fs from 'node:fs/promises';
import config from '../../../../config/index.js';

Settings.llm = openai({
  apiKey: config.openai_secret_key,
  model: 'gpt-4o',
});

Settings.embedModel = new OpenAIEmbedding();

let index = null;

export async function createIndexFromFile(filePath) {
  const text = await fs.readFile(filePath, 'utf-8');
  const document = new Document({ text, id_: filePath });

  index = await VectorStoreIndex.fromDocuments([document]);
  return { message: 'Index created from file', file: filePath };
}
export async function askQuery(query) {
  if (!index) throw new Error('Index not ready. Please run /index-doc first');

  const queryEngine = index.asQueryEngine();
  const { message, sourceNodes } = await queryEngine.query({ query });

  const data = {
    content: message.content,
    sources: sourceNodes?.map((node, i) => ({
      score: node.score.toFixed(3),
      snippet: node.node.getContent(MetadataMode.NONE).substring(0, 80) + '...',
    })),
  };
  console.log('Query Result:', data);
  return data;
}
