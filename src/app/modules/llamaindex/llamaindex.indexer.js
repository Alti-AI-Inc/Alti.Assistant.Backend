import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLM, BaseEmbedding, Document, MetadataMode, Settings, VectorStoreIndex, SentenceSplitter, storageContextFromDefaults } from 'llamaindex';
import fs from 'node:fs/2.0/promises'; // Wait, let's keep the standard fs
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import config from '../../../../config/index.js';

class GoogleLLM extends BaseLLM {
  constructor(apiKey, modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.client.getGenerativeModel({ 
      model: this.modelName,
      systemInstruction: `You are Alti's premium real-time AI analyst. 
Your goal is to answer the user's questions with high precision, clarity, and absolute truthfulness based strictly on the provided context information.
Rules you MUST follow:
1. Answer the question using ONLY the provided context blocks. Do NOT use external or pre-trained knowledge.
2. If the context does not contain the answer, say "I cannot find the answer to this question in the provided document." and do not speculate.
3. Be direct, professional, and clear. Maintain a sleek, enterprise-ready tone.`
    });
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
Settings.nodeParser = new SentenceSplitter({ chunkSize: 512, chunkOverlap: 64 });

async function extractTextAndBuildDocuments(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const fileName = originalName || path.basename(filePath);
  
  console.log(`LlamaIndex Ingestion: Parsing file ${fileName} with extension ${ext}`);

  try {
    if (ext === '.pdf') {
      const dataBuffer = await fsPromises.readFile(filePath);
      const pdf = new PDFParse({ data: dataBuffer });
      const parsedData = await pdf.getText();

      if (!parsedData || !parsedData.pages || parsedData.pages.length === 0) {
        throw new Error('PDF has no extractable text pages.');
      }

      console.log(`LlamaIndex Ingestion: Extracted ${parsedData.pages.length} pages from PDF`);

      return parsedData.pages.map((page, idx) => {
        return new Document({
          text: page.text || '',
          id_: `${filePath}_page_${idx + 1}`,
          metadata: {
            fileName,
            fileType: 'pdf',
            pageNumber: idx + 1
          }
        });
      });
    } else if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value || '';
      
      console.log(`LlamaIndex Ingestion: Extracted ${text.length} characters from DOCX`);

      return [
        new Document({
          text,
          id_: filePath,
          metadata: {
            fileName,
            fileType: 'docx'
          }
        })
      ];
    } else {
      // Fallback for txt, md, csv, etc.
      const text = await fsPromises.readFile(filePath, 'utf-8');
      console.log(`LlamaIndex Ingestion: Read ${text.length} characters from text file`);
      
      return [
        new Document({
          text,
          id_: filePath,
          metadata: {
            fileName,
            fileType: 'txt'
          }
        })
      ];
    }
  } catch (error) {
    console.error(`LlamaIndex Ingestion Warning: Advanced parsing failed for ${ext}. Falling back to plain text read. Error:`, error);
    try {
      const text = await fsPromises.readFile(filePath, 'utf-8');
      return [
        new Document({
          text,
          id_: filePath,
          metadata: {
            fileName,
            fileType: 'txt',
            fallback: true
          }
        })
      ];
    } catch (fallbackError) {
      throw new Error(`Failed to extract text from document: ${fallbackError.message}`);
    }
  }
}

export async function createIndexFromFile(filePath, originalName = '', userId = 'default_user') {
  const documents = await extractTextAndBuildDocuments(filePath, originalName);
  
  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  
  // Clear previous index for this specific user to isolate the chat workspace
  try {
    if (existsSync(persistDir)) {
      await fsPromises.rm(persistDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`LlamaIndex Storage: Failed to clear old index at ${persistDir}:`, err);
  }
  
  // Create a persistent storage context
  const storageContext = await storageContextFromDefaults({ persistDir });
  
  // Ingest, parse, split, and save vectors to disk
  await VectorStoreIndex.fromDocuments(documents, { storageContext });
  
  console.log(`LlamaIndex Indexer: Built & persisted index for user ${userId} to ${persistDir}`);
  return { message: 'Index created from file', file: originalName || filePath };
}

export async function askQuery(query, userId = 'default_user') {
  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  
  if (!existsSync(persistDir)) {
    throw new Error('No active document indexed. Please upload a document to begin chatting.');
  }

  // Load the index dynamically from the persisted storage context on disk
  const storageContext = await storageContextFromDefaults({ persistDir });
  const loadedIndex = await VectorStoreIndex.init({ storageContext });
  
  const queryEngine = loadedIndex.asQueryEngine({ similarityTopK: 5 });
  const { message, sourceNodes } = await queryEngine.query({ query });

  const data = {
    content: message.content,
    sources: sourceNodes?.map((node) => {
      const score = node.score !== undefined && node.score !== null ? node.score.toFixed(3) : '1.000';
      const meta = node.node.metadata || {};
      const pageTag = meta.pageNumber ? `[Page ${meta.pageNumber}] ` : '';
      const snippet = pageTag + node.node.getContent(MetadataMode.NONE).substring(0, 180).trim() + '...';
      
      return {
        score,
        snippet,
      };
    }) || [],
  };
  console.log(`Query Result for user ${userId}:`, data);
  return data;
}
