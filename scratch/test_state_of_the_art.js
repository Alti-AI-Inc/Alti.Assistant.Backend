import { BaseLLM, BaseEmbedding, Document, VectorStoreIndex, Settings } from 'llamaindex';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

class GoogleLLM extends BaseLLM {
  constructor(apiKey, modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash') {
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
        console.log(`Embedding model failed, falling back to gemini-embedding-001`);
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
        console.log(`Embedding batch failed, falling back to gemini-embedding-001`);
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found, skipping live run');
    return;
  }

  Settings.llm = new GoogleLLM(apiKey);
  Settings.embedModel = new GoogleEmbedding(apiKey);

  console.log('1. Creating vector store index with test documents...');
  const docs = [
    new Document({ text: 'In fiscal year 2025, Alti achieved a record annual revenue of $12.4 million, representing a 45% year-over-year increase.', id_: 'doc1' }),
    new Document({ text: 'The capital of France is Paris. It is widely known as the city of lights and fashion.', id_: 'doc2' }),
    new Document({ text: 'Alti was founded in 2024 by a team of ex-Google AI researchers. It is headquartered in San Francisco.', id_: 'doc3' }),
    new Document({ text: 'The CEO of Alti is Jane Doe, who previously led enterprise AI products at Google Cloud.', id_: 'doc4' })
  ];

  const index = await VectorStoreIndex.fromDocuments(docs);
  console.log('Index created successfully!');

  // Test Query Expansion
  const query = 'Who is leading Alti and how much money did they make in 2025?';
  console.log('\n2. Testing Query Expansion for:', query);

  const expandPrompt = `You are a professional retrieval-query expander. Given a search query, generate exactly 3 alternative search queries that use synonyms, structural variations, or related terms to describe the user's intent. These variations are used to search a vector database.
Return ONLY a valid JSON array of strings containing the 3 queries, e.g. ["query variation 1", "query variation 2", "query variation 3"] and nothing else. Do not use markdown backticks, explanations, or labels.

Original Query: ${query}

JSON Array:`;

  const expandResult = await Settings.llm.chat({
    messages: [{ role: 'user', content: expandPrompt }]
  });
  const cleaned = expandResult.message.content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const variations = JSON.parse(cleaned);
  console.log('Query Variations:', variations);

  // Test Retrieval
  console.log('\n3. Retrieving nodes...');
  const allQueries = [query, ...variations];
  const retriever = index.asRetriever({ similarityTopK: 5 });

  const results = await Promise.all(allQueries.map(q => retriever.retrieve({ query: q })));
  
  // Deduplicate
  const nodeMap = new Map();
  for (const nodeList of results) {
    for (const node of nodeList) {
      const id = node.node.id_ || node.node.getContent();
      if (!nodeMap.has(id)) {
        nodeMap.set(id, node);
      }
    }
  }
  const uniqueNodes = Array.from(nodeMap.values());
  console.log(`Retrieved ${uniqueNodes.length} unique nodes total.`);

  // LLM Re-ranking
  console.log('\n4. Running LLM Re-ranking...');
  const nodesStr = uniqueNodes.map((n, i) => `[Block ${i}]: ${n.node.getContent()}`).join('\n\n');
  const rerankPrompt = `You are a premium AI retrieval auditor. Given a search query and a list of text blocks, select the indexes of the blocks that contain the most direct, relevant information to answer the query.
Order them by relevance, with the most relevant first.
Return ONLY a valid JSON array of numbers representing the matching block indexes, e.g. [1, 3] and nothing else. Do not write any markdown code blocks or explanations.

Search Query: ${query}

Text Blocks:
${nodesStr}

Relevant Block Indexes:`;

  const rerankResult = await Settings.llm.chat({
    messages: [{ role: 'user', content: rerankPrompt }]
  });
  const rerankCleaned = rerankResult.message.content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const rerankedIndexes = JSON.parse(rerankCleaned);
  console.log('Reranked Indexes:', rerankedIndexes);

  const topNodes = rerankedIndexes.slice(0, 5).map(idx => uniqueNodes[idx]).filter(Boolean);
  console.log('\n5. Selected Re-ranked Blocks:');
  topNodes.forEach((node, i) => {
    console.log(`- Top ${i+1}: ${node.node.getContent()}`);
  });
}

run().catch(console.error);
