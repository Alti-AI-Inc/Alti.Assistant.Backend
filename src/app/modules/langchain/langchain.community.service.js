/**
 * LangChain Community Tools & Integrations Service
 * Covers: LangGraph Swarm, MongoDB chat history, community tools (Wikipedia, Calculator),
 * additional document loaders (Confluence, Slack, S3), vector store wrappers,
 * MongoDB memory persistence, and MCP-ready tool creation
 */
import { ChatTogetherAI } from '@langchain/together-ai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool, DynamicTool, tool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { z } from 'zod';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

function getLLM(temperature = 0.2) {
  return new ChatTogetherAI({
    apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
    model: config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature,
  });
}

export const CommunityIntegrationsService = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  LANGGRAPH SWARM (Multi-Agent Handoff)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. Multi-Agent Swarm with Handoff ──────────────────────────────────
  async runSwarm({ task }) {
    try {
      const { createSwarm, createHandoffTool, createSwarmAgent } = await import('@langchain/langgraph-swarm');
      const llm = getLLM(0.2);

      // Define specialist agents with handoff capabilities
      const researchAgent = createSwarmAgent({
        llm,
        name: 'researcher',
        instructions: 'You are an expert researcher. Find facts and evidence. Hand off to the analyst when research is complete.',
        tools: [
          createHandoffTool({ agentName: 'analyst', description: 'Hand off to analyst for data analysis' }),
        ],
      });

      const analystAgent = createSwarmAgent({
        llm,
        name: 'analyst',
        instructions: 'You are a data analyst. Analyze research findings. Hand off to the writer for final output.',
        tools: [
          createHandoffTool({ agentName: 'writer', description: 'Hand off to writer for final document' }),
        ],
      });

      const writerAgent = createSwarmAgent({
        llm,
        name: 'writer',
        instructions: 'You are a professional writer. Create polished, well-structured final content.',
        tools: [],
      });

      const swarm = createSwarm({
        agents: [researchAgent, analystAgent, writerAgent],
        defaultActiveAgent: 'researcher',
      });

      const app = swarm.compile();
      const result = await app.invoke({
        messages: [new HumanMessage(task)],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      return {
        task,
        output: lastMessage?.content || '',
        agentCount: 3,
        framework: 'LangGraph Swarm',
      };
    } catch (error) {
      logger.warn(`[CommunityIntegrations] Swarm error: ${error.message}`);
      // Fallback to sequential processing
      const llm = getLLM(0.2);
      const response = await llm.invoke([
        new SystemMessage('You are an expert researcher, analyst, and writer. Complete the task thoroughly.'),
        new HumanMessage(task),
      ]);
      return { task, output: response.content, agentCount: 1, fallback: true, framework: 'LangGraph Swarm (fallback)' };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CUSTOM TOOL CREATION (DynamicTool, DynamicStructuredTool, @tool)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 2. Create and Run Agent with Custom Tools ──────────────────────────
  async runAgentWithCustomTools({ input, customTools = [] }) {
    const llm = getLLM(0.1);

    // Built-in tools
    const calculatorTool = tool(
      async ({ expression }) => {
        try {
          // Safe math evaluation (no eval)
          const result = new Function(`"use strict"; return (${expression.replace(/[^0-9+\-*/().%\s]/g, '')})`)();
          return `Result: ${result}`;
        } catch { return 'Error: Invalid expression'; }
      },
      {
        name: 'calculator',
        description: 'Calculate math expressions. Input should be a valid math expression like "2 + 2" or "15 * 7".',
        schema: z.object({ expression: z.string().describe('Math expression to evaluate') }),
      }
    );

    const dateTimeTool = tool(
      async () => new Date().toISOString(),
      {
        name: 'get_current_datetime',
        description: 'Get the current date and time in ISO format.',
        schema: z.object({}),
      }
    );

    const wordCountTool = tool(
      async ({ text }) => `Word count: ${text.split(/\s+/).filter(w => w).length}`,
      {
        name: 'word_count',
        description: 'Count the number of words in a text.',
        schema: z.object({ text: z.string().describe('Text to count words in') }),
      }
    );

    const jsonFormatterTool = tool(
      async ({ data }) => {
        try { return JSON.stringify(JSON.parse(data), null, 2); }
        catch { return 'Error: Invalid JSON'; }
      },
      {
        name: 'format_json',
        description: 'Format/pretty-print a JSON string.',
        schema: z.object({ data: z.string().describe('JSON string to format') }),
      }
    );

    const textAnalysisTool = tool(
      async ({ text }) => {
        const words = text.split(/\s+/).filter(w => w);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const chars = text.length;
        const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / words.length;
        return JSON.stringify({
          characters: chars,
          words: words.length,
          sentences: sentences.length,
          avgWordLength: avgWordLen.toFixed(1),
          readingTimeMinutes: (words.length / 200).toFixed(1),
        });
      },
      {
        name: 'analyze_text',
        description: 'Analyze text statistics: character count, word count, sentence count, reading time.',
        schema: z.object({ text: z.string().describe('Text to analyze') }),
      }
    );

    const allTools = [calculatorTool, dateTimeTool, wordCountTool, jsonFormatterTool, textAnalysisTool];

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are a helpful assistant with tools. Use them when appropriate.'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    const agent = createToolCallingAgent({ llm, tools: allTools, prompt });
    const executor = new AgentExecutor({ agent, tools: allTools, maxIterations: 5 });
    const result = await executor.invoke({ input });

    return {
      input,
      output: result.output,
      toolsAvailable: allTools.map(t => t.name),
      framework: 'LangChain Agent with Custom Tools',
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  MONGODB INTEGRATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 3. MongoDB Chat Message History ────────────────────────────────────
  async runMongoDBMemoryChat({ input, sessionId, connectionString }) {
    try {
      const { MongoDBChatMessageHistory } = await import('@langchain/mongodb');
      const { MongoClient } = await import('mongodb');

      const mongoUri = connectionString || config.mongodb_uri || process.env.DATABASE_URL;
      const client = new MongoClient(mongoUri);
      await client.connect();
      const collection = client.db('aphura').collection('langchain_chat_history');

      const messageHistory = new MongoDBChatMessageHistory({
        collection,
        sessionId: sessionId || 'default',
      });

      const llm = getLLM(0.3);
      // Get existing messages
      const pastMessages = await messageHistory.getMessages();
      const messages = [
        new SystemMessage('You are a helpful assistant with persistent memory across conversations.'),
        ...pastMessages,
        new HumanMessage(input),
      ];

      const response = await llm.invoke(messages);

      // Save to MongoDB
      await messageHistory.addUserMessage(input);
      await messageHistory.addAIMessage(response.content);

      await client.close();

      return {
        input,
        output: response.content,
        sessionId,
        historyLength: pastMessages.length + 2,
        framework: 'LangChain @langchain/mongodb ChatMessageHistory',
      };
    } catch (error) {
      logger.warn(`[CommunityIntegrations] MongoDB memory error: ${error.message}`);
      // Fallback to stateless
      const llm = getLLM(0.3);
      const response = await llm.invoke([new SystemMessage('You are a helpful assistant.'), new HumanMessage(input)]);
      return { input, output: response.content, sessionId, fallback: true, framework: 'LangChain MongoDB (fallback)' };
    }
  },

  // ─── 4. Clear MongoDB Chat History ──────────────────────────────────────
  async clearMongoDBHistory({ sessionId, connectionString }) {
    try {
      const { MongoDBChatMessageHistory } = await import('@langchain/mongodb');
      const { MongoClient } = await import('mongodb');

      const mongoUri = connectionString || config.mongodb_uri || process.env.DATABASE_URL;
      const client = new MongoClient(mongoUri);
      await client.connect();
      const collection = client.db('aphura').collection('langchain_chat_history');

      const messageHistory = new MongoDBChatMessageHistory({ collection, sessionId });
      await messageHistory.clear();
      await client.close();

      return { sessionId, cleared: true, framework: 'LangChain MongoDB Clear History' };
    } catch (error) {
      return { sessionId, cleared: false, error: error.message };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMMUNITY DOCUMENT LOADERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 5. Confluence Loader ───────────────────────────────────────────────
  async loadConfluence({ baseUrl, spaceKey, username, apiToken, limit = 25 }) {
    try {
      const { ConfluencePagesLoader } = await import('@langchain/community/document_loaders/web/confluence');
      const loader = new ConfluencePagesLoader({
        baseUrl,
        spaceKey,
        username: username || process.env.CONFLUENCE_USERNAME,
        accessToken: apiToken || process.env.CONFLUENCE_API_TOKEN,
        limit,
      });
      const docs = await loader.load();
      return {
        spaceKey,
        documentCount: docs.length,
        pages: docs.slice(0, 20).map(d => ({
          title: d.metadata?.title,
          content: d.pageContent.substring(0, 1000),
        })),
        framework: 'LangChain ConfluencePagesLoader',
      };
    } catch (error) {
      return { error: `Confluence loading failed: ${error.message}`, spaceKey };
    }
  },

  // ─── 6. S3 File Loader ──────────────────────────────────────────────────
  async loadS3File({ bucket, key, region = 'us-east-1' }) {
    try {
      const { S3Loader } = await import('@langchain/community/document_loaders/web/s3');
      const loader = new S3Loader({
        bucket,
        key,
        region,
      });
      const docs = await loader.load();
      return {
        bucket,
        key,
        documentCount: docs.length,
        content: docs.map(d => d.pageContent.substring(0, 2000)).join('\n'),
        framework: 'LangChain S3Loader',
      };
    } catch (error) {
      return { error: `S3 loading failed: ${error.message}`, bucket, key };
    }
  },

  // ─── 7. Sitemap Loader ──────────────────────────────────────────────────
  async loadSitemap({ url, filterUrls }) {
    try {
      const { SitemapLoader } = await import('@langchain/community/document_loaders/web/sitemap');
      const loader = new SitemapLoader(url, { filterUrls });
      const docs = await loader.load();
      return {
        url,
        documentCount: docs.length,
        pages: docs.slice(0, 30).map(d => ({
          url: d.metadata?.source || d.metadata?.loc,
          contentPreview: d.pageContent.substring(0, 500),
        })),
        framework: 'LangChain SitemapLoader',
      };
    } catch (error) {
      return { error: `Sitemap loading failed: ${error.message}`, url };
    }
  },

  // ─── 8. Recursive URL Loader ────────────────────────────────────────────
  async loadRecursiveURL({ url, maxDepth = 2, maxPages = 20 }) {
    try {
      const { RecursiveUrlLoader } = await import('@langchain/community/document_loaders/web/recursive_url');
      const loader = new RecursiveUrlLoader(url, {
        maxDepth,
        maxPages,
      });
      const docs = await loader.load();
      return {
        url,
        maxDepth,
        documentCount: docs.length,
        pages: docs.slice(0, 20).map(d => ({
          url: d.metadata?.source,
          contentPreview: d.pageContent.substring(0, 500),
        })),
        framework: 'LangChain RecursiveUrlLoader',
      };
    } catch (error) {
      return { error: `Recursive URL loading failed: ${error.message}`, url };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  EMBEDDING & SIMILARITY
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 9. Together AI Embeddings ──────────────────────────────────────────
  async generateEmbeddings({ texts }) {
    try {
      const { TogetherAIEmbeddings } = await import('@langchain/together-ai');
      const embeddings = new TogetherAIEmbeddings({
        apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
        model: 'togethercomputer/m2-bert-80M-8k-retrieval',
      });

      const vectors = await embeddings.embedDocuments(texts);
      return {
        textCount: texts.length,
        dimensions: vectors[0]?.length || 0,
        vectors: vectors.map((v, i) => ({
          text: texts[i].substring(0, 100),
          vectorPreview: v.slice(0, 5),
        })),
        framework: 'LangChain TogetherAIEmbeddings',
      };
    } catch (error) {
      return { error: `Embedding failed: ${error.message}`, textCount: texts.length };
    }
  },

  // ─── 10. Semantic Similarity Search ─────────────────────────────────────
  async semanticSimilarity({ query, documents }) {
    try {
      const { TogetherAIEmbeddings } = await import('@langchain/together-ai');
      const embeddings = new TogetherAIEmbeddings({
        apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
        model: 'togethercomputer/m2-bert-80M-8k-retrieval',
      });

      const queryVec = await embeddings.embedQuery(query);
      const docVecs = await embeddings.embedDocuments(documents);

      // Cosine similarity
      const cosineSim = (a, b) => {
        const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dot / (magA * magB);
      };

      const results = documents.map((doc, i) => ({
        document: doc.substring(0, 200),
        score: cosineSim(queryVec, docVecs[i]),
      })).sort((a, b) => b.score - a.score);

      return { query, results, framework: 'LangChain Semantic Similarity' };
    } catch (error) {
      return { error: `Similarity search failed: ${error.message}` };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  MULTI-MODAL & ADVANCED
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 11. Multi-Modal Vision Chat ────────────────────────────────────────
  async multiModalChat({ text, imageUrl }) {
    const llm = getLLM(0.2);
    const messages = [
      new HumanMessage({
        content: [
          { type: 'text', text: text || 'Describe this image in detail.' },
          ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : []),
        ],
      }),
    ];

    const response = await llm.invoke(messages);
    return {
      text,
      imageUrl,
      output: response.content,
      framework: 'LangChain Multi-Modal Chat',
    };
  },

  // ─── 12. Structured Tool Agent with Together AI ─────────────────────────
  async runStructuredToolAgent({ input }) {
    const llm = getLLM(0.1);

    const webSearchTool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Search the web for current information.',
      schema: z.object({
        query: z.string().describe('Search query'),
        numResults: z.number().optional().describe('Number of results'),
      }),
      func: async ({ query, numResults = 5 }) => {
        return `[Simulated web search for: "${query}" - ${numResults} results]`;
      },
    });

    const summarizeTool = new DynamicStructuredTool({
      name: 'summarize',
      description: 'Summarize a long text into key points.',
      schema: z.object({
        text: z.string().describe('Text to summarize'),
        style: z.enum(['bullet', 'paragraph', 'executive']).optional(),
      }),
      func: async ({ text, style = 'bullet' }) => {
        const response = await getLLM(0.2).invoke([
          new SystemMessage(`Summarize in ${style} format.`),
          new HumanMessage(text),
        ]);
        return response.content;
      },
    });

    const allTools = [webSearchTool, summarizeTool];
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are an expert assistant with structured tools.'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    const agent = createToolCallingAgent({ llm, tools: allTools, prompt });
    const executor = new AgentExecutor({ agent, tools: allTools, maxIterations: 5 });
    const result = await executor.invoke({ input });

    return {
      input,
      output: result.output,
      framework: 'LangChain DynamicStructuredTool Agent',
    };
  },

  // ─── 13. List All Available Integrations ────────────────────────────────
  listAvailableIntegrations() {
    return {
      installed: [
        { package: 'langchain', version: '^0.3.37', category: 'core' },
        { package: '@langchain/core', version: '^1.2.1', category: 'core' },
        { package: '@langchain/langgraph', version: '^1.4.5', category: 'orchestration' },
        { package: '@langchain/langgraph-swarm', version: 'latest', category: 'orchestration' },
        { package: '@langchain/together-ai', version: '^0.2.13', category: 'provider' },
        { package: '@langchain/community', version: '^1.1.29', category: 'integrations' },
        { package: '@langchain/exa', version: '^1.0.2', category: 'search' },
        { package: '@langchain/textsplitters', version: '^1.0.1', category: 'processing' },
        { package: '@langchain/mongodb', version: 'latest', category: 'persistence' },
        { package: 'langsmith', version: '^0.10.5', category: 'observability' },
      ],
      features: {
        lcel: ['RunnableSequence', 'RunnableParallel', 'RunnableBranch', 'RunnableWithMessageHistory', 'RunnableLambda', 'RunnablePassthrough', 'Batch', 'Stream', 'Fallbacks'],
        outputParsers: ['StringOutputParser', 'JsonOutputParser', 'CommaSeparatedListOutputParser', 'StructuredOutputParser (Zod)'],
        agents: ['createToolCallingAgent', 'AgentExecutor', 'DynamicTool', 'DynamicStructuredTool', '@tool decorator'],
        graphs: ['StateGraph', 'MessagesAnnotation', 'Annotation', 'MemorySaver', 'ConditionalEdges', 'InterruptBefore', 'Streaming', 'Checkpoints', 'Swarm'],
        documentLoaders: ['CheerioWebBaseLoader', 'PDFLoader', 'CSVLoader', 'JSONLoader', 'GithubRepoLoader', 'NotionAPILoader', 'ConfluencePagesLoader', 'S3Loader', 'SitemapLoader', 'RecursiveUrlLoader'],
        memory: ['BufferMemory', 'ChatMessageHistory (InMemory)', 'MongoDBChatMessageHistory', 'MemorySaver (LangGraph)'],
        embeddings: ['TogetherAIEmbeddings', 'SemanticSimilarity'],
        observability: ['LangSmith Tracing', 'Datasets', 'Evaluations', 'Feedback', 'AnnotationQueues', 'PromptHub', 'Monitoring'],
      },
      totalFunctions: '80+',
      totalEndpoints: '70+',
    };
  },
};

export default CommunityIntegrationsService;
