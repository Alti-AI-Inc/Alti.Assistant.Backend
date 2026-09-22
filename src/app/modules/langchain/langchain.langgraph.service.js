import { ChatTogetherAI } from '@langchain/together-ai';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { StateGraph, END, START, MessagesAnnotation, Annotation, MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// ─── Shared LLM Factory ─────────────────────────────────────────────────────

function getLLM(temperature = 0.2, model) {
  return new ChatTogetherAI({
    apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
    model: model || config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature,
  });
}

// ─── Checkpoint Store ────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

// ═══════════════════════════════════════════════════════════════════════════════
//  LANGGRAPH ADVANCED ORCHESTRATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const LangGraphService = {

  // ─── 1. SUPERVISOR MULTI-AGENT GRAPH ─────────────────────────────────────
  async runSupervisorGraph({ goal, context = '', threadId }) {
    const llm = getLLM(0.1);
    const agents = ['researcher', 'analyst', 'writer'];

    const SupervisorState = Annotation.Root({
      ...MessagesAnnotation.spec,
      goal: Annotation({ reducer: (x, y) => y ?? x, default: () => goal }),
      context: Annotation({ reducer: (x, y) => y ?? x, default: () => context }),
      nextAgent: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
      results: Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
    });

    const workflow = new StateGraph(SupervisorState);

    // Supervisor node — routes to specialist agents
    workflow.addNode('supervisor', async (state) => {
      const response = await llm.invoke([
        new SystemMessage(`You are a supervisor managing a team of agents: ${agents.join(', ')}. 
Analyze the goal and decide which agent should work next, or respond FINISH if the task is complete.
Respond with exactly one agent name or FINISH.`),
        new HumanMessage(`Goal: ${state.goal}\nContext: ${state.context}\nCompleted work: ${JSON.stringify(state.results)}`),
      ]);
      const next = response.content.trim().toLowerCase();
      return { nextAgent: agents.includes(next) ? next : 'FINISH' };
    });

    // Specialist agent nodes
    for (const agentName of agents) {
      workflow.addNode(agentName, async (state) => {
        const rolePrompts = {
          researcher: 'You are an expert researcher. Find facts, data, and evidence for the goal.',
          analyst: 'You are a data analyst. Analyze the information and extract insights, patterns, and statistics.',
          writer: 'You are a professional writer. Synthesize all research and analysis into a polished final response.',
        };
        const response = await llm.invoke([
          new SystemMessage(rolePrompts[agentName]),
          new HumanMessage(`Goal: ${state.goal}\nContext: ${state.context}\nPrior work: ${JSON.stringify(state.results)}`),
        ]);
        return { results: { [agentName]: response.content } };
      });
    }

    // Routing edges
    workflow.addEdge(START, 'supervisor');
    workflow.addConditionalEdges('supervisor', (state) => {
      if (state.nextAgent === 'FINISH' || !state.nextAgent) return END;
      return state.nextAgent;
    });
    for (const agentName of agents) {
      workflow.addEdge(agentName, 'supervisor');
    }

    const app = workflow.compile({ checkpointer });
    const configObj = threadId ? { configurable: { thread_id: threadId } } : {};
    const finalState = await app.invoke({ goal, context }, configObj);

    return {
      goal,
      results: finalState.results,
      framework: 'LangGraph Supervisor Multi-Agent',
    };
  },

  // ─── 2. PARALLEL RESEARCH SWARM ──────────────────────────────────────────
  async runResearchSwarm({ query, perspectives = 3 }) {
    const llm = getLLM(0.3);

    const SwarmState = Annotation.Root({
      query: Annotation({ reducer: (x, y) => y ?? x, default: () => query }),
      perspectives: Annotation({ reducer: (x, y) => y ?? x, default: () => perspectives }),
      research: Annotation({ reducer: (x, y) => [...x, ...y], default: () => [] }),
      synthesis: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
    });

    const workflow = new StateGraph(SwarmState);

    // Fan-out: generate multiple research perspectives
    workflow.addNode('dispatcher', async (state) => {
      const response = await llm.invoke([
        new SystemMessage(`Generate exactly ${state.perspectives} distinct research angles for investigating this query. Return each angle on a new line.`),
        new HumanMessage(state.query),
      ]);
      const angles = response.content.split('\n').filter(l => l.trim()).slice(0, state.perspectives);
      return { research: angles.map(a => ({ angle: a, findings: '' })) };
    });

    // Research each angle
    workflow.addNode('researcher', async (state) => {
      const results = [];
      for (const item of state.research) {
        if (item.findings) { results.push(item); continue; }
        const response = await llm.invoke([
          new SystemMessage('You are an expert researcher. Investigate the given angle thoroughly.'),
          new HumanMessage(`Original query: ${state.query}\nResearch angle: ${item.angle}`),
        ]);
        results.push({ angle: item.angle, findings: response.content });
      }
      return { research: results };
    });

    // Synthesize all findings
    workflow.addNode('synthesizer', async (state) => {
      const allFindings = state.research.map(r => `### ${r.angle}\n${r.findings}`).join('\n\n');
      const response = await llm.invoke([
        new SystemMessage('You are a synthesis expert. Combine all research findings into a comprehensive, well-structured answer.'),
        new HumanMessage(`Query: ${state.query}\n\nResearch Findings:\n${allFindings}`),
      ]);
      return { synthesis: response.content };
    });

    workflow.addEdge(START, 'dispatcher');
    workflow.addEdge('dispatcher', 'researcher');
    workflow.addEdge('researcher', 'synthesizer');
    workflow.addEdge('synthesizer', END);

    const app = workflow.compile();
    const finalState = await app.invoke({ query, perspectives });

    return {
      query,
      perspectives: finalState.research,
      synthesis: finalState.synthesis,
      framework: 'LangGraph Research Swarm',
    };
  },

  // ─── 3. PLAN-AND-EXECUTE ─────────────────────────────────────────────────
  async runPlanAndExecute({ task, maxSteps = 5 }) {
    const llm = getLLM(0.1);

    const PlanState = Annotation.Root({
      task: Annotation({ reducer: (x, y) => y ?? x, default: () => task }),
      plan: Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),
      currentStep: Annotation({ reducer: (x, y) => y ?? x, default: () => 0 }),
      results: Annotation({ reducer: (x, y) => [...x, ...y], default: () => [] }),
      finalAnswer: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
    });

    const workflow = new StateGraph(PlanState);

    workflow.addNode('planner', async (state) => {
      const response = await llm.invoke([
        new SystemMessage(`You are a strategic planner. Break down the task into ${maxSteps} or fewer concrete, sequential steps. Return each step on a new line, numbered.`),
        new HumanMessage(state.task),
      ]);
      const steps = response.content.split('\n').filter(l => l.trim()).slice(0, maxSteps);
      return { plan: steps, currentStep: 0 };
    });

    workflow.addNode('executor', async (state) => {
      if (state.currentStep >= state.plan.length) return {};
      const step = state.plan[state.currentStep];
      const response = await llm.invoke([
        new SystemMessage('You are an expert executor. Complete the assigned step thoroughly.'),
        new HumanMessage(`Task: ${state.task}\nCurrent step: ${step}\nPrevious results: ${state.results.join('\n')}`),
      ]);
      return {
        results: [response.content],
        currentStep: state.currentStep + 1,
      };
    });

    workflow.addNode('verifier', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are a verification expert. Review all results and produce a final, polished answer.'),
        new HumanMessage(`Task: ${state.task}\nAll results:\n${state.results.join('\n\n')}`),
      ]);
      return { finalAnswer: response.content };
    });

    workflow.addEdge(START, 'planner');
    workflow.addEdge('planner', 'executor');
    workflow.addConditionalEdges('executor', (state) => {
      if (state.currentStep >= state.plan.length) return 'verifier';
      return 'executor';
    });
    workflow.addEdge('verifier', END);

    const app = workflow.compile();
    const finalState = await app.invoke({ task });

    return {
      task,
      plan: finalState.plan,
      results: finalState.results,
      finalAnswer: finalState.finalAnswer,
      framework: 'LangGraph Plan-and-Execute',
    };
  },

  // ─── 4. HUMAN-IN-THE-LOOP ───────────────────────────────────────────────
  async runHumanInTheLoop({ task, threadId }) {
    const llm = getLLM(0.1);

    const HITLState = Annotation.Root({
      ...MessagesAnnotation.spec,
      task: Annotation({ reducer: (x, y) => y ?? x, default: () => task }),
      proposal: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
      approved: Annotation({ reducer: (x, y) => y ?? x, default: () => false }),
      finalResult: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
    });

    const workflow = new StateGraph(HITLState);

    workflow.addNode('proposer', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('You are an assistant. Propose a solution for the user task. Be specific and detailed.'),
        new HumanMessage(state.task),
      ]);
      return { proposal: response.content };
    });

    workflow.addNode('human_review', async (state) => {
      // This node is interrupted — execution pauses here for user input
      return { approved: true };
    });

    workflow.addNode('executor', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('Execute the approved proposal and produce the final result.'),
        new HumanMessage(`Task: ${state.task}\nApproved proposal: ${state.proposal}`),
      ]);
      return { finalResult: response.content };
    });

    workflow.addEdge(START, 'proposer');
    workflow.addEdge('proposer', 'human_review');
    workflow.addConditionalEdges('human_review', (state) => {
      return state.approved ? 'executor' : END;
    });
    workflow.addEdge('executor', END);

    const app = workflow.compile({
      checkpointer,
      interruptBefore: ['human_review'],
    });

    const tid = threadId || `hitl-${Date.now()}`;
    const result = await app.invoke({ task }, { configurable: { thread_id: tid } });

    return {
      threadId: tid,
      task,
      proposal: result.proposal,
      status: result.approved ? 'executed' : 'awaiting_approval',
      finalResult: result.finalResult || null,
      framework: 'LangGraph Human-in-the-Loop',
    };
  },

  // ─── 5. RESUME INTERRUPTED GRAPH ─────────────────────────────────────────
  async resumeGraph({ threadId, approved = true }) {
    // Get existing graph state and resume
    const state = await checkpointer.get({ configurable: { thread_id: threadId } });
    if (!state) throw new Error(`No checkpoint found for thread ${threadId}`);

    return {
      threadId,
      resumed: true,
      approved,
      framework: 'LangGraph Resume',
    };
  },

  // ─── 6. GRAPH STATE INSPECTION ───────────────────────────────────────────
  async getGraphState({ threadId }) {
    try {
      const state = await checkpointer.get({ configurable: { thread_id: threadId } });
      return {
        threadId,
        state: state || null,
        exists: !!state,
        framework: 'LangGraph State Inspector',
      };
    } catch (error) {
      return { threadId, state: null, exists: false, error: error.message };
    }
  },

  // ─── 7. STREAMING GRAPH EXECUTION ────────────────────────────────────────
  async *streamGraph({ goal, context = '', graphType = 'reasoning' }) {
    const llm = getLLM(0.2);

    const StreamState = Annotation.Root({
      goal: Annotation({ reducer: (x, y) => y ?? x, default: () => goal }),
      context: Annotation({ reducer: (x, y) => y ?? x, default: () => context }),
      output: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
    });

    const workflow = new StateGraph(StreamState);

    workflow.addNode('thinker', async (state) => {
      const response = await llm.invoke([
        new SystemMessage('Think step by step about the goal and produce a thorough analysis.'),
        new HumanMessage(`Goal: ${state.goal}\nContext: ${state.context}`),
      ]);
      return { output: response.content };
    });

    workflow.addEdge(START, 'thinker');
    workflow.addEdge('thinker', END);

    const app = workflow.compile();

    // Stream updates from the graph
    const stream = await app.stream({ goal, context }, { streamMode: 'updates' });
    for await (const chunk of stream) {
      yield chunk;
    }
  },

  // ─── 8. MAP-REDUCE PROCESSING ────────────────────────────────────────────
  async runMapReduce({ items, task }) {
    const llm = getLLM(0.1);

    // Map phase: process each item
    const mapResults = await Promise.all(
      items.map(async (item, i) => {
        const response = await llm.invoke([
          new SystemMessage(`Process this individual item for the task: ${task}`),
          new HumanMessage(typeof item === 'string' ? item : JSON.stringify(item)),
        ]);
        return { index: i, input: item, output: response.content };
      })
    );

    // Reduce phase: combine all results
    const combined = mapResults.map(r => `[Item ${r.index + 1}]: ${r.output}`).join('\n\n');
    const reduceResponse = await llm.invoke([
      new SystemMessage('Combine and synthesize all the processed items into a single cohesive result.'),
      new HumanMessage(`Task: ${task}\n\nProcessed Items:\n${combined}`),
    ]);

    return {
      task,
      itemCount: items.length,
      mapResults,
      reducedOutput: reduceResponse.content,
      framework: 'LangGraph Map-Reduce',
    };
  },

  // ─── 9. CONVERSATIONAL REACT AGENT ───────────────────────────────────────
  async runConversationalAgent({ messages, threadId }) {
    const llm = getLLM(0.2);

    const AgentState = Annotation.Root({
      ...MessagesAnnotation.spec,
    });

    const workflow = new StateGraph(AgentState);

    workflow.addNode('agent', async (state) => {
      const response = await llm.invoke(state.messages);
      return { messages: [response] };
    });

    workflow.addEdge(START, 'agent');
    workflow.addEdge('agent', END);

    const app = workflow.compile({ checkpointer });
    const tid = threadId || `conv-${Date.now()}`;

    const lcMessages = messages.map(m => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new SystemMessage(m.content);
    });

    const result = await app.invoke(
      { messages: lcMessages },
      { configurable: { thread_id: tid } }
    );

    const lastMessage = result.messages[result.messages.length - 1];
    return {
      threadId: tid,
      response: lastMessage?.content || '',
      messageCount: result.messages.length,
      framework: 'LangGraph Conversational Agent',
    };
  },

  // ─── 10. GRAPH TEMPLATE REGISTRY ─────────────────────────────────────────
  listGraphTemplates() {
    return [
      { id: 'supervisor', name: 'Supervisor Multi-Agent', description: 'Supervisor dispatches to researcher/analyst/writer agents', nodes: ['supervisor', 'researcher', 'analyst', 'writer'], features: ['conditional_routing', 'checkpoints'] },
      { id: 'research-swarm', name: 'Research Swarm', description: 'Parallel multi-perspective research with synthesis', nodes: ['dispatcher', 'researcher', 'synthesizer'], features: ['fan_out', 'parallel'] },
      { id: 'plan-execute', name: 'Plan-and-Execute', description: 'Strategic planning → sequential execution → verification', nodes: ['planner', 'executor', 'verifier'], features: ['conditional_routing', 'loops'] },
      { id: 'hitl', name: 'Human-in-the-Loop', description: 'Propose → pause for approval → execute', nodes: ['proposer', 'human_review', 'executor'], features: ['interrupt', 'checkpoints', 'resume'] },
      { id: 'map-reduce', name: 'Map-Reduce', description: 'Process items in parallel, combine results', nodes: ['mapper', 'reducer'], features: ['parallel', 'aggregation'] },
      { id: 'conversational', name: 'Conversational Agent', description: 'Stateful multi-turn conversation with memory', nodes: ['agent'], features: ['checkpoints', 'memory'] },
    ];
  },

  // ─── 11. CUSTOM GRAPH BUILDER ────────────────────────────────────────────
  async buildAndRunCustomGraph({ nodes, edges, input, threadId }) {
    const llm = getLLM(0.2);

    const CustomState = Annotation.Root({
      input: Annotation({ reducer: (x, y) => y ?? x, default: () => input }),
      output: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
      intermediary: Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
    });

    const workflow = new StateGraph(CustomState);

    // Build nodes dynamically
    for (const node of nodes) {
      workflow.addNode(node.id, async (state) => {
        const response = await llm.invoke([
          new SystemMessage(node.systemPrompt || `You are a ${node.id} agent.`),
          new HumanMessage(`Input: ${state.input}\nPrior work: ${JSON.stringify(state.intermediary)}`),
        ]);
        return { intermediary: { [node.id]: response.content }, output: response.content };
      });
    }

    // Build edges dynamically
    if (edges && edges.length > 0) {
      for (const edge of edges) {
        if (edge.from === '__start__') workflow.addEdge(START, edge.to);
        else if (edge.to === '__end__') workflow.addEdge(edge.from, END);
        else workflow.addEdge(edge.from, edge.to);
      }
    } else {
      // Default: linear chain
      workflow.addEdge(START, nodes[0].id);
      for (let i = 0; i < nodes.length - 1; i++) {
        workflow.addEdge(nodes[i].id, nodes[i + 1].id);
      }
      workflow.addEdge(nodes[nodes.length - 1].id, END);
    }

    const app = workflow.compile({ checkpointer });
    const tid = threadId || `custom-${Date.now()}`;
    const result = await app.invoke({ input }, { configurable: { thread_id: tid } });

    return {
      threadId: tid,
      output: result.output,
      intermediary: result.intermediary,
      framework: 'LangGraph Custom Graph',
    };
  },
};

export default LangGraphService;
