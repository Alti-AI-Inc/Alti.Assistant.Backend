import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLM, BaseEmbedding, Document, MetadataMode, Settings, VectorStoreIndex } from 'llamaindex';
import fs from 'node:fs/promises';
import config from '../../../../config/index.js';

class GoogleLLM extends BaseLLM {
  constructor(apiKey, modelName = 'gemini-3.5-flash') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.client.getGenerativeModel({ model: this.modelName });
  }

  get metadata() {
    return {
      model: this.modelName,
      temperature: 0.1,
      topP: 1,
      maxTokens: undefined,
      contextWindow: 1000000,
      tokenizer: undefined,
      structuredOutput: true
    };
  }

  async chat(params) {
    const { messages } = params;
    const contents = messages.map(msg => {
      let role = 'user';
      if (msg.role === 'assistant' || msg.role === 'model' || msg.role === 'ai') {
        role = 'model';
      }
      return {
        role,
        parts: [{ text: msg.content }]
      };
    });

    const result = await this.model.generateContent({ contents });
    const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      message: {
        content: text,
        role: 'assistant',
      },
      raw: result,
    };
  }
}

class GoogleEmbedding extends BaseEmbedding {
  constructor(apiKey) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = 'text-embedding-004';
    this.model = this.client.getGenerativeModel({ model: this.modelName });
    this.embedBatchSize = 10;
  }

  async getTextEmbedding(text) {
    try {
      const result = await this.model.embedContent(text);
      return result.embedding.values;
    } catch (err) {
      if (this.modelName !== 'gemini-embedding-001') {
        console.log(`Embedding model ${this.modelName} failed, falling back to gemini-embedding-001`);
        this.modelName = 'gemini-embedding-001';
        this.model = this.client.getGenerativeModel({ model: this.modelName });
        const result = await this.model.embedContent(text);
        return result.embedding.values;
      }
      throw err;
    }
  }

  async getTextEmbeddings(texts) {
    try {
      const result = await this.model.batchEmbedContents({
        requests: texts.map((text) => ({
          content: { parts: [{ text }] },
        })),
      });
      return result.embeddings.map((e) => e.values);
    } catch (err) {
      if (this.modelName !== 'gemini-embedding-001') {
        console.log(`Embedding batch model ${this.modelName} failed, falling back to gemini-embedding-001`);
        this.modelName = 'gemini-embedding-001';
        this.model = this.client.getGenerativeModel({ model: this.modelName });
        const result = await this.model.batchEmbedContents({
          requests: texts.map((text) => ({
            content: { parts: [{ text }] },
          })),
        });
        return result.embeddings.map((e) => e.values);
      }
      throw err;
    }
  }
}

const geminiApiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
Settings.llm = new GoogleLLM(geminiApiKey);
Settings.embedModel = new GoogleEmbedding(geminiApiKey);

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
