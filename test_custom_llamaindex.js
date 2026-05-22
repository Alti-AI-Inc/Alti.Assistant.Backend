import { BaseLLM, BaseEmbedding, Document, VectorStoreIndex, Settings } from 'llamaindex';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config/index.js';

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

async function run() {
  try {
    console.log('Testing GoogleLLM and GoogleEmbedding...');
    const apiKey = config.gemini_secret_key;
    if (!apiKey) {
      console.error('Gemini key not found, skipping execution test');
      return;
    }
    
    Settings.llm = new GoogleLLM(apiKey);
    Settings.embedModel = new GoogleEmbedding(apiKey);

    const doc = new Document({ text: 'The capital of France is Paris. Paris is a very beautiful city.' });
    const index = await VectorStoreIndex.fromDocuments([doc]);
    console.log('Index created successfully!');

    const queryEngine = index.asQueryEngine();
    const response = await queryEngine.query({ query: 'What is the capital of France?' });
    console.log('Response content:', response.message.content);
  } catch (err) {
    console.error('Error during LlamaIndex custom test:', err);
  }
}

run();
