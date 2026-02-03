// import { openai, OpenAIEmbedding } from '@llamaindex/openai';
// import { Document, MetadataMode, Settings, VectorStoreIndex } from 'llamaindex';
// import fs from 'node:fs/promises';
// import config from '../../../../config/index.js';

// Settings.llm = openai({
//   apiKey: config.openai_secret_key,
//   model: 'gpt-4o',
// });

// Settings.embedModel = new OpenAIEmbedding();

// let index = null;

// export async function createIndexFromFile(filePath) {
//   const text = await fs.readFile(filePath, 'utf-8');
//   const document = new Document({ text, id_: filePath });

//   index = await VectorStoreIndex.fromDocuments([document]);
//   return { message: 'Index created from file', file: filePath };
// }
// export async function askQuery(query) {
//   if (!index) throw new Error('Index not ready. Please run /index-doc first');

//   const queryEngine = index.asQueryEngine();
//   const { message, sourceNodes } = await queryEngine.query({ query });

//   const data = {
//     content: message.content,
//     sources: sourceNodes?.map((node, i) => ({
//       score: node.score.toFixed(3),
//       snippet: node.node.getContent(MetadataMode.NONE).substring(0, 80) + '...',
//     })),
//   };
//   console.log('Query Result:', data);
//   return data;
// }

// ==============================================
//   More Improve Version with LangChain
// ==============================================
import { ChatOpenAI } from '@langchain/openai';
import { openai, OpenAIEmbedding } from '@llamaindex/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { Document, Settings, VectorStoreIndex } from 'llamaindex';
import fs from 'node:fs/promises';
import config from '../../../../config/index.js';

// ✅ Required by LlamaIndex
Settings.llm = openai({
  apiKey: config.openai_secret_key,
  model: 'gpt-4o',
});

Settings.embedModel = new OpenAIEmbedding({
  apiKey: config.openai_secret_key,
  model: 'text-embedding-3-small',
});

let chain = null;
export async function createIndexFromFiles(filePaths) {
  const documents = await Promise.all(
    filePaths.map(async (filePath) => {
      const text = await fs.readFile(filePath, 'utf-8');
      return new Document({ text, id_: filePath });
    })
  );

  const index = await VectorStoreIndex.fromDocuments(documents);

  const llamaRetriever = index.asRetriever();

  const retriever = {
    getRelevantDocuments: async (input) => {
      const results = await llamaRetriever.retrieve(input);
      return results.map(r => ({
        pageContent: r.node.getContent(),
        metadata: r.node.metadata ?? {},
      }));
    }
  };

  const llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.3,
    openAIApiKey: config.openai_secret_key,
  });

  const memory = new BufferMemory({
    returnMessages: true,
    memoryKey: 'chat_history',
  });

  chain = ConversationalRetrievalQAChain.fromLLM(llm, retriever, {
    memory,
  });

  return { message: 'Index created from multiple files', files: filePaths };
}

export async function askQuery(query) {
  if (!chain) throw new Error('Index not ready. Please run /index-doc first');

  const result = await chain.call({ question: query });

  return {
    content: result.text,
    sources: result.sourceDocuments?.map(doc => ({
      snippet: doc.pageContent.substring(0, 80) + '...',
    })),
  };
}
