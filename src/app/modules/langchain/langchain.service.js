import { ChatTogetherAI } from '@langchain/together-ai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, END, START } from '@langchain/langgraph';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { BufferMemory } from 'langchain/memory';
import { ConversationChain } from 'langchain/chains';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { ExaSearchResults } from '@langchain/exa';
import Exa from 'exa-js';
import z from 'zod';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

function getTogetherLLM(temperature = 0.2) {
  return new ChatTogetherAI({
    apiKey: config.llm?.apiKey || process.env.LLM_API_KEY,
    model: config.llm?.model || 'gpt-oss-120b',
    temperature,
  });
}

export const LangChainService = {
  // ── 1. LangGraph Reasoning ─────────────────────────────────────────────────
  async runReasoningGraph({ goal, context = '' }) {
    const llm = getTogetherLLM(0.1);
    const graphState = {
      goal: { value: (x, y) => y ?? x, default: () => goal },
      context: { value: (x, y) => y ?? x, default: () => context },
      plan: { value: (x, y) => y ?? x, default: () => [] },
      solution: { value: (x, y) => y ?? x, default: () => '' },
      critique: { value: (x, y) => y ?? x, default: () => '' },
    };

    const workflow = new StateGraph({ channels: graphState });

    workflow.addNode('planner', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a strategic planning agent. Break down the goal into 3-5 concrete execution steps.'),
        new HumanMessage(`Goal: ${state.goal}\nContext: ${state.context}`),
      ]);
      return { plan: [response.content] };
    });

    workflow.addNode('synthesizer', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a synthesis execution agent. Execute the plan and write the complete answer or solution.'),
        new HumanMessage(`Goal: ${state.goal}\nPlan: ${state.plan.join('\n')}`),
      ]);
      return { solution: response.content };
    });

    workflow.addNode('critic', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a critical quality auditor. Review the solution for completeness, accuracy, and edge cases. Suggest improvements.'),
        new HumanMessage(`Goal: ${state.goal}\nSolution: ${state.solution}`),
      ]);
      return { critique: response.content };
    });

    workflow.addEdge(START, 'planner');
    workflow.addEdge('planner', 'synthesizer');
    workflow.addEdge('synthesizer', 'critic');
    workflow.addEdge('critic', END);

    const app = workflow.compile();
    const finalState = await app.invoke({ goal, context });

    return {
      goal,
      plan: finalState.plan,
      solution: finalState.solution,
      critique: finalState.critique,
      model: 'gpt-oss-120b',
      framework: 'LangGraph v1.4',
    };
  },

  // ── 2. Vanilla RAG Chain ───────────────────────────────────────────────────
  async runRagChain({ query, documents = [] }) {
    const llm = getTogetherLLM(0.0);
    const contextText = documents.map((doc, i) => `[Doc ${i + 1}]: ${doc}`).join('\n\n');

    const response = await llm.invoke([
      new SystemMessage('You are a grounded RAG assistant. Answer strictly based on the provided documents. Cite doc numbers for every claim.'),
      new HumanMessage(`Documents:\n${contextText}\n\nQuestion: ${query}`),
    ]);

    return { query, answer: response.content, documentsCount: documents.length, model: 'gpt-oss-120b' };
  },

  async runSummarizeChain({ text, style = 'bullet-points' }) {
    const llm = getTogetherLLM(0.2);
    const response = await llm.invoke([
      new SystemMessage(`You are an expert executive summarizer. Produce a clear, concise summary in ${style} format. Highlight key takeaways and action items.`),
      new HumanMessage(text),
    ]);
    return { summary: response.content, originalLength: text.length, style, model: 'gpt-oss-120b' };
  },

  // ── 3. Tool Calling Agent Executor ─────────────────────────────────────────
  async runToolAgent({ input, tools = [] }) {
    const llm = getTogetherLLM(0.1);
    
    // Default system template for OpenAI-style tool calling agents
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are a helpful assistant equipped with tools.'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);
    
    const agent = createToolCallingAgent({ llm, tools, prompt });
    const agentExecutor = new AgentExecutor({ agent, tools });
    
    const result = await agentExecutor.invoke({ input });
    return {
      input,
      output: result.output,
      model: 'gpt-oss-120b',
      framework: 'LangChain AgentExecutor'
    };
  },

  // ── 4. Structured Output Parsers ───────────────────────────────────────────
  async parseStructuredOutput({ input, schemaDefinition }) {
    const llm = getTogetherLLM(0.0);
    
    // We expect a Zod-compatible schema definition structure passed in (mocked for this service)
    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        answer: z.string().describe("answer to the user's question"),
        confidence: z.number().min(0).max(100).describe("confidence score 0-100"),
        sources: z.array(z.string()).describe("list of sources used")
      })
    );
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Extract information and format exactly as requested.\n{format_instructions}"],
      ["human", "{question}"]
    ]);
    
    const chain = prompt.pipe(llm).pipe(parser);
    const result = await chain.invoke({
      question: input,
      format_instructions: parser.getFormatInstructions(),
    });
    
    return {
      input,
      parsed: result,
      framework: 'LangChain StructuredOutputParser'
    };
  },

  // ── 5. Text Splitters ──────────────────────────────────────────────────────
  async splitText({ text, chunkSize = 1000, chunkOverlap = 200 }) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
    
    const docs = await splitter.createDocuments([text]);
    return {
      totalDocs: docs.length,
      chunks: docs.map(d => d.pageContent),
      framework: 'LangChain RecursiveCharacterTextSplitter'
    };
  },

  // ── 6. Conversation Memory ─────────────────────────────────────────────────
  async runMemoryChain({ input, sessionId }) {
    const llm = getTogetherLLM(0.3);
    // In production, this would be tied to Redis/MongoDB buffer memory mapped by sessionId
    const memory = new BufferMemory();
    const chain = new ConversationChain({ llm, memory });
    
    const res = await chain.invoke({ input });
    return {
      response: res.response,
      framework: 'LangChain ConversationChain + BufferMemory'
    };
  },

  // ── 7. Document Loaders (Community) ────────────────────────────────────────
  async scrapeWebPage(url) {
    const loader = new CheerioWebBaseLoader(url);
    const docs = await loader.load();
    return {
      url,
      documentCount: docs.length,
      content: docs[0]?.pageContent?.substring(0, 5000), // Cap for safety
      framework: 'LangChain CheerioWebBaseLoader'
    };
  },

  // ── 8. Exa Neural Search Integration ────────────────────────────────────────
  async runExaSearchAgent({ input }) {
    const llm = getTogetherLLM(0.1);
    
    // Instantiate Exa tool
    const client = new Exa(config.exa_api_key);
    const exaTool = new ExaSearchResults({ client });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are an elite research assistant. Use the Exa search tool to find accurate and up-to-date information.'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);
    
    const agent = createToolCallingAgent({ llm, tools: [exaTool], prompt });
    const agentExecutor = new AgentExecutor({ agent, tools: [exaTool] });
    
    const result = await agentExecutor.invoke({ input });
    return {
      input,
      output: result.output,
      model: 'gpt-oss-120b',
      framework: 'LangChain @langchain/exa'
    };
  },

  async listGraphTemplates() {
    return [
      { id: 'planner-critic-loop', name: 'Planner-Synthesizer-Critic Graph', description: 'Tri-agent graph for rigorous decomposition', stateNodes: ['planner', 'synthesizer', 'critic'], license: 'MIT' },
      { id: 'multi-agent-research-swarm', name: 'Autonomous Research Swarm', description: 'Multi-node supervisor graph dispatching parallel search', stateNodes: ['supervisor', 'researcher', 'writer'], license: 'MIT' },
      { id: 'durable-temporal-pipeline', name: 'Temporal Durable Agent Graph', description: 'LangGraph inside Temporal workflows', stateNodes: ['workflow_init', 'tool_dispatch'], license: 'Apache 2.0' },
    ];
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  NEW CORE LANGCHAIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 9. QA Chain with Citations ────────────────────────────────────────────
  async runQAChain({ query, documents = [], returnSources = true }) {
    const llm = getTogetherLLM(0.0);
    const contextText = documents.map((doc, i) => `[Source ${i + 1}]: ${doc}`).join('\n\n');

    const response = await llm.invoke([
      new SystemMessage(`You are a precise question-answering assistant. Answer ONLY based on the provided sources. 
For every claim, cite the source number in brackets like [Source 1]. 
If the answer cannot be found in the sources, say "I don't have enough information from the provided sources."`),
      new HumanMessage(`Sources:\n${contextText}\n\nQuestion: ${query}`),
    ]);

    return {
      query,
      answer: response.content,
      sourcesUsed: documents.length,
      model: 'gpt-oss-120b',
      framework: 'LangChain QA Chain',
    };
  },

  // ── 10. Conversational RAG (Multi-turn with History) ──────────────────────
  async runConversationalRAG({ query, documents = [], chatHistory = [] }) {
    const llm = getTogetherLLM(0.1);

    // Step 1: Reformulate the question considering chat history
    let standaloneQuery = query;
    if (chatHistory.length > 0) {
      const historyText = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
      const reformulation = await llm.invoke([
        new SystemMessage('Given the following conversation history and follow-up question, rephrase the follow-up question to be a standalone question. Return only the rephrased question.'),
        new HumanMessage(`Chat History:\n${historyText}\n\nFollow-up Question: ${query}`),
      ]);
      standaloneQuery = reformulation.content;
    }

    // Step 2: Answer with documents
    const contextText = documents.map((doc, i) => `[Doc ${i + 1}]: ${doc}`).join('\n\n');
    const response = await llm.invoke([
      new SystemMessage('You are a grounded RAG assistant. Answer based on the provided documents. Cite doc numbers.'),
      new HumanMessage(`Documents:\n${contextText}\n\nQuestion: ${standaloneQuery}`),
    ]);

    return {
      originalQuery: query,
      standaloneQuery,
      answer: response.content,
      documentsCount: documents.length,
      historyTurns: chatHistory.length,
      model: 'gpt-oss-120b',
      framework: 'LangChain Conversational RAG',
    };
  },

  // ── 11. Map-Reduce Summarization ──────────────────────────────────────────
  async runMapReduceSummarize({ texts, style = 'executive-summary' }) {
    const llm = getTogetherLLM(0.2);
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 3000, chunkOverlap: 200 });

    // Map: summarize each chunk
    const allChunks = [];
    for (const text of texts) {
      const docs = await splitter.createDocuments([text]);
      allChunks.push(...docs);
    }

    const chunkSummaries = await Promise.all(
      allChunks.map(async (doc) => {
        const response = await llm.invoke([
          new SystemMessage('Summarize the following text concisely, preserving key facts and figures.'),
          new HumanMessage(doc.pageContent),
        ]);
        return response.content;
      })
    );

    // Reduce: combine chunk summaries
    const combined = chunkSummaries.join('\n\n---\n\n');
    const finalResponse = await llm.invoke([
      new SystemMessage(`You are an expert summarizer. Combine these partial summaries into a single cohesive ${style}. Remove redundancy and highlight the most important points.`),
      new HumanMessage(combined),
    ]);

    return {
      summary: finalResponse.content,
      chunksProcessed: allChunks.length,
      originalTexts: texts.length,
      style,
      framework: 'LangChain Map-Reduce Summarization',
    };
  },

  // ── 12. Refine Chain ──────────────────────────────────────────────────────
  async runRefineChain({ text, question }) {
    const llm = getTogetherLLM(0.1);
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([text]);

    let currentAnswer = '';
    for (let i = 0; i < docs.length; i++) {
      if (i === 0) {
        const response = await llm.invoke([
          new SystemMessage('Answer the question based on the provided context.'),
          new HumanMessage(`Context: ${docs[i].pageContent}\n\nQuestion: ${question}`),
        ]);
        currentAnswer = response.content;
      } else {
        const response = await llm.invoke([
          new SystemMessage('You have an existing answer and new context. Refine the existing answer with the new context if needed. Only update if the new context is relevant.'),
          new HumanMessage(`Existing Answer: ${currentAnswer}\n\nNew Context: ${docs[i].pageContent}\n\nQuestion: ${question}`),
        ]);
        currentAnswer = response.content;
      }
    }

    return {
      answer: currentAnswer,
      chunksProcessed: docs.length,
      question,
      framework: 'LangChain Refine Chain',
    };
  },

  // ── 13. PDF Document Loader ───────────────────────────────────────────────
  async loadPDF(filePath) {
    try {
      const { PDFLoader } = await import('@langchain/community/document_loaders/fs/pdf');
      const loader = new PDFLoader(filePath);
      const docs = await loader.load();
      return {
        filePath,
        documentCount: docs.length,
        pages: docs.map((d, i) => ({
          page: i + 1,
          content: d.pageContent.substring(0, 2000),
          metadata: d.metadata,
        })),
        framework: 'LangChain PDFLoader',
      };
    } catch (error) {
      return { error: `PDF loading failed: ${error.message}`, filePath };
    }
  },

  // ── 14. CSV Document Loader ───────────────────────────────────────────────
  async loadCSV(filePath, { column } = {}) {
    try {
      const { CSVLoader } = await import('@langchain/community/document_loaders/fs/csv');
      const loader = new CSVLoader(filePath, { column });
      const docs = await loader.load();
      return {
        filePath,
        documentCount: docs.length,
        rows: docs.slice(0, 100).map(d => ({
          content: d.pageContent,
          metadata: d.metadata,
        })),
        framework: 'LangChain CSVLoader',
      };
    } catch (error) {
      return { error: `CSV loading failed: ${error.message}`, filePath };
    }
  },

  // ── 15. JSON Document Loader ──────────────────────────────────────────────
  async loadJSON(filePath, { jsonPointer } = {}) {
    try {
      const { JSONLoader } = await import('langchain/document_loaders/fs/json');
      const loader = new JSONLoader(filePath, jsonPointer);
      const docs = await loader.load();
      return {
        filePath,
        documentCount: docs.length,
        entries: docs.slice(0, 100).map(d => ({
          content: d.pageContent,
          metadata: d.metadata,
        })),
        framework: 'LangChain JSONLoader',
      };
    } catch (error) {
      return { error: `JSON loading failed: ${error.message}`, filePath };
    }
  },

  // ── 16. GitHub Repo Loader ────────────────────────────────────────────────
  async loadGitHubRepo({ url, branch = 'main', recursive = true }) {
    try {
      const { GithubRepoLoader } = await import('@langchain/community/document_loaders/web/github');
      const loader = new GithubRepoLoader(url, {
        branch,
        recursive,
        unknown: 'warn',
        maxConcurrency: 5,
      });
      const docs = await loader.load();
      return {
        url,
        branch,
        documentCount: docs.length,
        files: docs.slice(0, 50).map(d => ({
          path: d.metadata?.source,
          contentPreview: d.pageContent.substring(0, 500),
        })),
        framework: 'LangChain GithubRepoLoader',
      };
    } catch (error) {
      return { error: `GitHub loading failed: ${error.message}`, url };
    }
  },

  // ── 17. Notion Page Loader ────────────────────────────────────────────────
  async loadNotionPage({ pageId }) {
    try {
      const { NotionAPILoader } = await import('@langchain/community/document_loaders/web/notionapi');
      const loader = new NotionAPILoader({
        clientId: process.env.NOTION_CLIENT_ID,
        clientSecret: process.env.NOTION_CLIENT_SECRET,
        type: 'page',
        id: pageId,
      });
      const docs = await loader.load();
      return {
        pageId,
        documentCount: docs.length,
        content: docs.map(d => d.pageContent).join('\n'),
        framework: 'LangChain NotionAPILoader',
      };
    } catch (error) {
      return { error: `Notion loading failed: ${error.message}`, pageId };
    }
  },

  // ── 18. Router Chain (Intent-Based Routing) ───────────────────────────────
  async runRouterChain({ input }) {
    const llm = getTogetherLLM(0.0);

    // Classify the intent
    const classification = await llm.invoke([
      new SystemMessage(`Classify the following user input into exactly one category. Respond with only the category name.
Categories:
- code: Programming, debugging, code generation
- research: Information lookup, fact-finding, analysis
- creative: Writing, storytelling, brainstorming
- math: Calculations, equations, data analysis
- general: Casual conversation, greetings, other`),
      new HumanMessage(input),
    ]);

    const category = classification.content.trim().toLowerCase();

    // Route to specialized prompt
    const routePrompts = {
      code: 'You are an elite software engineer. Write clean, well-documented code with best practices.',
      research: 'You are a thorough researcher. Provide detailed, well-sourced, and comprehensive answers.',
      creative: 'You are a creative genius. Produce original, engaging, and imaginative content.',
      math: 'You are a mathematician. Show step-by-step work and verify your calculations.',
      general: 'You are a helpful, friendly assistant.',
    };

    const response = await llm.invoke([
      new SystemMessage(routePrompts[category] || routePrompts.general),
      new HumanMessage(input),
    ]);

    return {
      input,
      detectedCategory: category,
      response: response.content,
      framework: 'LangChain Router Chain',
    };
  },
};

// ─── Re-export LangGraph Service ─────────────────────────────────────────────
export { LangGraphService } from './langchain.langgraph.service.js';
export { LangSmithService } from './langsmith.service.js';
export { SSECallbackHandler, createStreamingCallback } from './langchain.callbacks.service.js';

export default LangChainService;

