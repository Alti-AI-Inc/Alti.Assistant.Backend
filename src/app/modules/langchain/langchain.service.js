import { ChatGroq } from '@langchain/groq';
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

function getGroqLLM(temperature = 0.2) {
  return new ChatGroq({
    apiKey: config.groq?.apiKey || process.env.GROQ_API_KEY,
    model: config.groq?.model || 'gpt-oss-120b',
    temperature,
  });
}

export const LangChainService = {
  // ── 1. LangGraph Reasoning ─────────────────────────────────────────────────
  async runReasoningGraph({ goal, context = '' }) {
    const llm = getGroqLLM(0.1);
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
    const llm = getGroqLLM(0.0);
    const contextText = documents.map((doc, i) => `[Doc ${i + 1}]: ${doc}`).join('\n\n');

    const response = await llm.invoke([
      new SystemMessage('You are a grounded RAG assistant. Answer strictly based on the provided documents. Cite doc numbers for every claim.'),
      new HumanMessage(`Documents:\n${contextText}\n\nQuestion: ${query}`),
    ]);

    return { query, answer: response.content, documentsCount: documents.length, model: 'gpt-oss-120b' };
  },

  async runSummarizeChain({ text, style = 'bullet-points' }) {
    const llm = getGroqLLM(0.2);
    const response = await llm.invoke([
      new SystemMessage(`You are an expert executive summarizer. Produce a clear, concise summary in ${style} format. Highlight key takeaways and action items.`),
      new HumanMessage(text),
    ]);
    return { summary: response.content, originalLength: text.length, style, model: 'gpt-oss-120b' };
  },

  // ── 3. Tool Calling Agent Executor ─────────────────────────────────────────
  async runToolAgent({ input, tools = [] }) {
    const llm = getGroqLLM(0.1);
    
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
    const llm = getGroqLLM(0.0);
    
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
    const llm = getGroqLLM(0.3);
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
    const llm = getGroqLLM(0.1);
    
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
};

export default LangChainService;
