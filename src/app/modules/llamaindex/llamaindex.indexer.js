import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLM, BaseEmbedding, Document, MetadataMode, Settings, VectorStoreIndex, SentenceSplitter, storageContextFromDefaults } from 'llamaindex';
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
  // Ensure the persist directory exists recursively before storage initialization
  try {
    await fsPromises.mkdir(persistDir, { recursive: true });
  } catch (err) {
    console.error(`LlamaIndex Storage: Failed to create index directory at ${persistDir}:`, err);
  }

  // Generate and Inject document-level semantic profile (Phase 2 Auto-Summarization)
  const fullText = documents.map(d => d.getText()).join('\n\n');
  console.log('LlamaIndex Profiler: Building document summary profile...');
  const profile = await generateDocumentProfile(fullText);
  console.log('LlamaIndex Profiler: Profile generated:', profile);
  
  // Save profile to disk
  const profilePath = path.join(persistDir, 'document_profile.json');
  try {
    await fsPromises.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (err) {
    console.error('LlamaIndex Profiler: Failed to write profile to disk:', err);
  }

  // Inject profile metadata to all documents so it propagates to individual chunks
  for (const doc of documents) {
    doc.metadata = {
      ...doc.metadata,
      docSummary: profile.summary,
      docTopics: profile.topics.join(', ')
    };
  }
  
  // Create a persistent storage context
  const storageContext = await storageContextFromDefaults({ persistDir });
  
  // Ingest, parse, split, and save vectors to disk
  await VectorStoreIndex.fromDocuments(documents, { storageContext });
  
  console.log(`LlamaIndex Indexer: Built & persisted index for user ${userId} to ${persistDir}`);
  return { message: 'Index created from file', file: originalName || filePath };
}

async function generateQueryVariations(query) {
  const prompt = `You are a professional retrieval-query expander. Given a search query, generate exactly 3 alternative search queries that use synonyms, structural variations, or related terms to describe the user's intent. These variations are used to search a vector database.
Return ONLY a valid JSON array of strings containing the 3 queries, e.g. ["query variation 1", "query variation 2", "query variation 3"] and nothing else. Do NOT use markdown backticks, explanations, or labels.

Original Query: ${query}

JSON Array:`;

  try {
    const result = await Settings.llm.chat({
      messages: [{ role: 'user', content: prompt }]
    });
    const content = result.message.content.trim();
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const variations = JSON.parse(cleaned);
    if (Array.isArray(variations) && variations.every(v => typeof v === 'string')) {
      return variations;
    }
  } catch (err) {
    console.error('LlamaIndex Multi-Query: Failed to generate query variations, falling back to original query.', err);
  }
  return [];
}

async function rerankNodesWithLLM(query, nodes) {
  if (!nodes || nodes.length === 0) return [];
  
  const nodesStr = nodes.map((n, i) => `[Block ${i}]: ${n.node.getContent(MetadataMode.NONE)}`).join('\n\n');
  const rerankPrompt = `You are a premium AI retrieval auditor. Given a search query and a list of text blocks, select the indexes of the blocks that contain the most direct, relevant information to answer the query.
Order them by relevance, with the most relevant first.
Return ONLY a valid JSON array of numbers representing the matching block indexes, e.g. [1, 3] and nothing else. Do not write any markdown code blocks or explanations.

Search Query: ${query}

Text Blocks:
${nodesStr}

Relevant Block Indexes:`;

  try {
    const result = await Settings.llm.chat({
      messages: [{ role: 'user', content: rerankPrompt }]
    });
    const content = result.message.content.trim();
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const rerankedIndexes = JSON.parse(cleaned);
    
    if (Array.isArray(rerankedIndexes)) {
      return rerankedIndexes
        .map(idx => nodes[idx])
        .filter(Boolean);
    }
  } catch (err) {
    console.error('LlamaIndex Re-ranker: Failed to cognitive re-rank nodes, falling back to original vector relevance.', err);
  }
  
  // Fallback to original order
  return nodes;
}

async function generateDocumentProfile(fullText) {
  if (!fullText || fullText.length < 50) {
    return { summary: 'Short document with minimal text.', topics: [] };
  }
  
  const textSample = fullText.substring(0, 15000); // Sample first 15k characters to keep token usage optimal and fast
  const prompt = `You are a premium AI document profiler. Analyze the following document text and produce:
1. A concise, professional 3-sentence summary of the document contents.
2. A list of exactly 5 key topics covered in the document.

Return ONLY a valid JSON object matching the following structure and nothing else. Do not use markdown backticks, explanations, or labels:
{
  "summary": "3-sentence summary text...",
  "topics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"]
}

Document Text:
${textSample}

JSON Object:`;

  try {
    const result = await Settings.llm.chat({
      messages: [{ role: 'user', content: prompt }]
    });
    const content = result.message.content.trim();
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const profile = JSON.parse(cleaned);
    if (profile.summary && Array.isArray(profile.topics)) {
      return profile;
    }
  } catch (err) {
    console.error('LlamaIndex Profiler: Failed to generate document profile, returning default.', err);
  }
  return { summary: 'Unable to parse document summary automatically.', topics: [] };
}

async function queryGoogleSearchGrounding(query) {
  try {
    const client = new GoogleGenerativeAI(geminiApiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      tools: [{ googleSearch: {} }]
    });
    
    console.log(`LlamaIndex Grounding: Querying Google Search for "${query}"`);
    const result = await model.generateContent(query);
    const text = result?.response?.text() || '';
    
    return {
      content: text,
      sources: [
        {
          score: '1.000',
          snippet: '[Google Search Grounding] Grounded dynamically using Google real-time search engine results.'
        }
      ]
    };
  } catch (err) {
    console.error('LlamaIndex Grounding: Google Search Grounding failed.', err);
    throw err;
  }
}

export async function askQuery(query, userId = 'default_user') {
  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  
  if (!existsSync(persistDir)) {
    throw new Error('No active document indexed. Please upload a document to begin chatting.');
  }

  // Load chat history from disk if it exists
  const historyPath = path.join(persistDir, 'chat_history.json');
  let chatHistory = [];
  try {
    if (existsSync(historyPath)) {
      const historyData = await fsPromises.readFile(historyPath, 'utf-8');
      chatHistory = JSON.parse(historyData);
    }
  } catch (err) {
    console.log(`LlamaIndex Memory: Failed to read history for user ${userId}, starting fresh.`);
  }

  // Load document profile summary if it exists (Phase 2 Priming)
  const profilePath = path.join(persistDir, 'document_profile.json');
  let docProfile = null;
  try {
    if (existsSync(profilePath)) {
      const profileData = await fsPromises.readFile(profilePath, 'utf-8');
      docProfile = JSON.parse(profileData);
    }
  } catch (err) {
    console.log(`LlamaIndex Profiler: No summary profile found for user ${userId}.`);
  }

  // Load the index dynamically from the persisted storage context on disk
  const storageContext = await storageContextFromDefaults({ persistDir });
  const loadedIndex = await VectorStoreIndex.init({ storageContext });

  // 1. Condense/Refine follow-up query if conversation history exists
  let refinedQuery = query;
  if (chatHistory.length > 0) {
    console.log(`LlamaIndex Memory: Condensing query based on ${chatHistory.length} historical exchanges.`);
    
    const historyStr = chatHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
    const condensePrompt = `Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone, self-contained question that captures the user's full intent.
Do NOT answer the question. Only output the rephrased standalone question.

Conversation History:
${historyStr}

Follow-up Question: ${query}
Standalone Question:`;
    
    try {
      const result = await Settings.llm.chat({
        messages: [{ role: 'user', content: condensePrompt }]
      });
      refinedQuery = result.message.content.trim();
      console.log(`LlamaIndex Memory: Condensed question from "${query}" to "${refinedQuery}"`);
    } catch (e) {
      console.error('LlamaIndex Memory Warning: Query condensation failed. Using raw query.', e);
    }
  }

  // 2. Multi-Query Expansion & Parallel Retrieval
  const variations = await generateQueryVariations(refinedQuery);
  const allQueries = [refinedQuery, ...variations];
  console.log(`LlamaIndex Retrieval: Querying index with ${allQueries.length} search variations.`);

  const retriever = loadedIndex.asRetriever({ similarityTopK: 8 });
  const retrievePromises = allQueries.map(q => retriever.retrieve({ query: q }));
  const results = await Promise.all(retrievePromises);

  // 3. Flatten and Deduplicate retrieved nodes
  const nodeMap = new Map();
  for (const nodeList of results) {
    for (const node of nodeList) {
      const nodeId = node.node.id_ || node.node.hash || node.node.getContent(MetadataMode.NONE);
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, node);
      }
    }
  }
  const uniqueNodes = Array.from(nodeMap.values());
  console.log(`LlamaIndex Retrieval: Found ${uniqueNodes.length} unique nodes total.`);

  // 4. Two-Stage LLM-based Re-ranking
  console.log('LlamaIndex Re-ranker: Commencing cognitive re-ranking stage.');
  const rerankedNodes = await rerankNodesWithLLM(refinedQuery, uniqueNodes);
  
  // Confine context synthesis strictly to the top-5 re-ranked nodes
  const topNodes = rerankedNodes.slice(0, 5);
  console.log(`LlamaIndex Re-ranker: Selected top ${topNodes.length} most relevant context blocks.`);

  // 5. Format the retrieved context nodes into clean reference snippets
  const contextStr = topNodes && topNodes.length > 0 
    ? topNodes.map((node, idx) => `[Node ${idx + 1}] (Source: ${node.node.metadata?.fileName ? node.node.metadata.fileName : 'Document'}${node.node.metadata?.pageNumber ? `, Page ${node.node.metadata.pageNumber}` : ''}): ${node.node.getContent(MetadataMode.NONE)}`).join('\n\n')
    : 'No context retrieved.';

  // 6. Synthesize final response utilizing context AND history
  const responsePrompt = `You are Alti's premium real-time AI analyst. 
Answer the user's question with high precision, clarity, and absolute truthfulness based strictly on the provided context information, document profile summary, and conversation history.

${docProfile ? `Document Profile Summary:
---------------------
${docProfile.summary}
Key Topics: ${docProfile.topics.join(', ')}
---------------------` : ''}

Provided Context Information:
---------------------
${contextStr}
---------------------

Conversation History:
${chatHistory.length > 0 ? chatHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n') : 'No history yet.'}

Current User Question: ${query}

Rules you MUST follow:
1. Answer the question using ONLY the provided context information. Do NOT use external or prior knowledge.
2. If the context does not contain the answer, say "I cannot find the answer to this question in the provided document." and do not speculate.
3. Be direct, professional, and clear. Maintain a sleek, enterprise-ready tone.`;

  const result = await Settings.llm.chat({
    messages: [{ role: 'user', content: responsePrompt }]
  });
  let reply = result.message.content.trim();

  // 7. Dynamic Web Grounding Fallback Check (Phase 2 Web Grounding)
  const insufficientKeywords = [
    "I cannot find the answer to this question in the provided document",
    "cannot find the answer",
    "does not contain information"
  ];
  const isInsufficient = insufficientKeywords.some(kw => reply.toLowerCase().includes(kw.toLowerCase()));

  if (isInsufficient) {
    console.log(`LlamaIndex Grounding: Local document context insufficient. Triggering Google Search Grounding Fallback for query: "${query}"`);
    try {
      const groundedResult = await queryGoogleSearchGrounding(query);
      
      // Save web search response in chat history instead of the flat rejection
      chatHistory.push({ role: 'user', content: query });
      chatHistory.push({ role: 'assistant', content: groundedResult.content });
      
      // Limit memory
      if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(-20);
      }
      await fsPromises.writeFile(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');

      return groundedResult;
    } catch (groundingErr) {
      console.error('LlamaIndex Grounding Fallback Warning: Web grounding failed. Returning original insufficient message.', groundingErr);
    }
  }

  // 8. Append new exchange to the persistent chat history for successful local synthesis
  chatHistory.push({ role: 'user', content: query });
  chatHistory.push({ role: 'assistant', content: reply });

  // Limit memory log to the last 10 exchanges (20 messages) to optimize token efficiency
  if (chatHistory.length > 20) {
    chatHistory = chatHistory.slice(-20);
  }

  try {
    await fsPromises.writeFile(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
  } catch (err) {
    console.error(`LlamaIndex Memory: Failed to save chat history to ${historyPath}:`, err);
  }

  // 9. Return response and formatted citations matching retrieved context nodes
  const data = {
    content: reply,
    sources: topNodes?.map((node) => {
      const score = node.score !== undefined && node.score !== null ? node.score.toFixed(3) : '1.000';
      const meta = node.node.metadata || {};
      const fileTag = meta.fileName ? `[${meta.fileName}${meta.pageNumber ? `, p. ${meta.pageNumber}` : ''}] ` : '';
      const snippet = fileTag + node.node.getContent(MetadataMode.NONE).substring(0, 200).trim() + '...';
      
      return {
        score,
        snippet,
      };
    }) || [],
  };
  console.log(`Query Result for user ${userId}:`, data);
  return data;
}
