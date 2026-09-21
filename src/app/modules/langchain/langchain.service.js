import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, END, START } from '@langchain/langgraph';
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
  /**
   * Executes a multi-stage LangGraph StateGraph (Planner -> Synthesizer -> Critic)
   */
  async runReasoningGraph({ goal, context = '' }) {
    const llm = getGroqLLM(0.1);

    // Define graph state channels
    const graphState = {
      goal: { value: (x, y) => y ?? x, default: () => goal },
      context: { value: (x, y) => y ?? x, default: () => context },
      plan: { value: (x, y) => y ?? x, default: () => [] },
      solution: { value: (x, y) => y ?? x, default: () => '' },
      critique: { value: (x, y) => y ?? x, default: () => '' },
    };

    const workflow = new StateGraph({ channels: graphState });

    // Node 1: Planner
    workflow.addNode('planner', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a strategic planning agent. Break down the goal into 3-5 concrete execution steps.'),
        new HumanMessage(`Goal: ${state.goal}\nContext: ${state.context}`),
      ]);
      return { plan: [response.content] };
    });

    // Node 2: Synthesizer
    workflow.addNode('synthesizer', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a synthesis execution agent. Execute the plan and write the complete answer or solution.'),
        new HumanMessage(`Goal: ${state.goal}\nPlan: ${state.plan.join('\n')}`),
      ]);
      return { solution: response.content };
    });

    // Node 3: Critic
    workflow.addNode('critic', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a critical quality auditor. Review the solution for completeness, accuracy, and edge cases. Suggest improvements.'),
        new HumanMessage(`Goal: ${state.goal}\nSolution: ${state.solution}`),
      ]);
      return { critique: response.content };
    });

    // Connect edges
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

  /**
   * RAG retrieval-augmented generation chain
   */
  async runRagChain({ query, documents = [] }) {
    const llm = getGroqLLM(0.0);
    const contextText = documents.map((doc, i) => `[Doc ${i + 1}]: ${doc}`).join('\n\n');

    const response = await llm.invoke([
      new SystemMessage('You are a grounded RAG assistant. Answer strictly based on the provided documents. Cite doc numbers for every claim.'),
      new HumanMessage(`Documents:\n${contextText}\n\nQuestion: ${query}`),
    ]);

    return {
      query,
      answer: response.content,
      documentsCount: documents.length,
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Recursive document summarization
   */
  async runSummarizeChain({ text, style = 'bullet-points' }) {
    const llm = getGroqLLM(0.2);

    const response = await llm.invoke([
      new SystemMessage(`You are an expert executive summarizer. Produce a clear, concise summary in ${style} format. Highlight key takeaways and action items.`),
      new HumanMessage(text),
    ]);

    return {
      summary: response.content,
      originalLength: text.length,
      style,
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Pre-built reasoning graph templates
   */
  async listGraphTemplates() {
    return [
      {
        id: 'planner-critic-loop',
        name: 'Planner-Synthesizer-Critic Graph',
        description: 'Tri-agent graph for rigorous decomposition and self-correction',
        stateNodes: ['planner', 'synthesizer', 'critic'],
        license: 'MIT',
      },
      {
        id: 'multi-agent-research-swarm',
        name: 'Autonomous Research Swarm',
        description: 'Multi-node supervisor graph dispatching parallel Exa search and Composio tools',
        stateNodes: ['supervisor', 'researcher', 'fact_checker', 'writer'],
        license: 'MIT',
      },
      {
        id: 'durable-temporal-pipeline',
        name: 'Temporal Durable Agent Graph',
        description: 'LangGraph graph wrapped inside Temporal durable activity executions',
        stateNodes: ['workflow_init', 'state_snapshot', 'tool_dispatch', 'state_reconcile'],
        license: 'Apache 2.0',
      },
    ];
  },
};

export default LangChainService;
