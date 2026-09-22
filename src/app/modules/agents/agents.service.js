import crypto from 'crypto';
import { llmChat, llmStream, llmToolCall } from '../../services/llm.client.js';
import { logger } from '../../../shared/logger.js';
import { MemoryService } from '../../services/memory.service.js';
import { GroundingService } from '../../services/grounding.service.js';
import { GuardrailsService } from '../../services/guardrails.service.js';
import { ModelRouter } from '../../services/modelRouter.service.js';
import Agent from './agents.model.js';

/**
 * Service to manage agents and their lifecycle
 */
const createAgent = async (userId, config) => {
  const agent = new Agent({ ...config, createdBy: userId });
  await agent.save();
  return agent;
};

const listAgents = async (userId, { page = 1, limit = 20, status, search }) => {
  const query = { createdBy: userId };
  if (status) query.status = status;
  if (search) query.name = { $regex: search, $options: 'i' };

  const agents = await Agent.find(query)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ createdAt: -1 });

  const total = await Agent.countDocuments(query);

  return {
    agents,
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

const getAgent = async (agentId) => {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');
  return agent;
};

const updateAgent = async (agentId, updates) => {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  Object.assign(agent, updates);
  agent.version += 1;
  await agent.save();
  return agent;
};

const deleteAgent = async (agentId) => {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');
  agent.status = 'archived';
  await agent.save();
  return agent;
};

const updateStatus = async (agentId, status) => {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');
  agent.status = status;
  await agent.save();
  return agent;
};

const duplicateAgent = async (agentId, userId) => {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  const newAgentData = agent.toObject();
  delete newAgentData._id;
  delete newAgentData.createdAt;
  delete newAgentData.updatedAt;

  newAgentData.name = `${newAgentData.name} (Copy)`;
  newAgentData.createdBy = userId;
  newAgentData.version = 1;
  newAgentData.metadata = { totalRuns: 0, successRate: 0, avgLatencyMs: 0 };

  const clonedAgent = new Agent(newAgentData);
  await clonedAgent.save();
  return clonedAgent;
};

const executeAgent = async (agentId, input, userId) => {
  const agent = await getAgent(agentId);
  const startTime = Date.now();

  // Smart model routing based on agent config
  const model = agent.model || ModelRouter.selectModel('AGENT', { message: input });

  // Build grounded system prompt
  let ragContext = '';
  if (agent.knowledgeBases && agent.knowledgeBases.length > 0) {
    try {
      const { RagService } = await import('../rag/rag.service.js');
      const ragResult = await RagService.query({ query: input, collectionId: agent.knowledgeBases[0] });
      ragContext = ragResult?.context || '';
    } catch (err) {
      logger.warn(`[AgentService] RAG query failed: ${err.message}`);
    }
  }

  // Retrieve relevant memories from Mem0
  let memoryContext = '';
  try {
    memoryContext = await MemoryService.buildMemoryContext(userId, agentId, input);
  } catch (err) {
    logger.warn(`[AgentService] Memory retrieval failed: ${err.message}`);
  }

  // Build anti-hallucination system prompt
  const groundedPrompt = GuardrailsService.buildGroundedSystemPrompt(
    agent.instructions,
    { ragContext, memoryContext }
  );

  const messages = [
    { role: 'system', content: groundedPrompt },
    { role: 'user', content: input }
  ];

  let output = '';
  let toolCalls = [];
  let tokensUsed = 0;

  if (agent.tools && agent.tools.length > 0) {
    const toolDefs = agent.tools.map(t => ({
      type: 'function',
      function: { name: t, description: `Execute ${t}`, parameters: { type: 'object', properties: {} } }
    }));
    const toolCallRes = await llmToolCall(messages, toolDefs, { model });
    output = toolCallRes?.choices?.[0]?.message?.content || 'Tool execution result';
    toolCalls = toolCallRes?.choices?.[0]?.message?.tool_calls || [];
    tokensUsed = toolCallRes?.usage?.total_tokens || 0;
  } else {
    const chatRes = await llmChat(messages, { model });
    output = chatRes?.choices?.[0]?.message?.content || 'Chat execution result';
    tokensUsed = chatRes?.usage?.total_tokens || 0;
  }

  // Ground the output — verify factual claims via Exa
  let groundingResult = { groundedOutput: output, score: 1.0, citations: [] };
  if (!agent.tools || agent.tools.length === 0) {
    // Only ground text outputs, not tool call results
    try {
      groundingResult = await GroundingService.groundOutput(output, { query: input });
    } catch (err) {
      logger.warn(`[AgentService] Grounding failed: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startTime;

  // Store conversation in memory for future context
  try {
    await MemoryService.addMemory(userId, agentId, [
      { role: 'user', content: input },
      { role: 'assistant', content: groundingResult.groundedOutput || output },
    ]);
  } catch (err) {
    logger.warn(`[AgentService] Memory storage failed: ${err.message}`);
  }

  agent.metadata.totalRuns += 1;
  agent.metadata.lastRunAt = new Date();
  await agent.save();

  return {
    runId: crypto.randomUUID(),
    output: groundingResult.groundedOutput || output,
    model,
    tokensUsed,
    durationMs,
    toolCalls,
    groundingScore: groundingResult.score,
    citations: groundingResult.citations || [],
  };
};

const executeAgentStream = async (agentId, input, userId) => {
  const agent = await getAgent(agentId);

  const systemPrompt = agent.instructions;
  let ragContext = '';

  if (agent.knowledgeBases && agent.knowledgeBases.length > 0) {
    ragContext = ' [RAG Context Placeholder] ';
  }

  const messages = [
    { role: 'system', content: `${systemPrompt}\n${ragContext}` },
    { role: 'user', content: input }
  ];

  const stream = await llmStream(messages, { model: agent.model });
  return stream;
};

const spawnSwarm = async (agentId, inputs, userId) => {
  // Use p-queue for concurrency-limited parallel execution
  let PQueue;
  try {
    const pq = await import('p-queue');
    PQueue = pq.default;
  } catch {
    // Fallback to unbounded if p-queue unavailable
    const results = await Promise.allSettled(
      inputs.map(input => executeAgent(agentId, input, userId))
    );
    return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason.message });
  }

  const agent = await getAgent(agentId);
  const concurrency = agent.swarmConfig?.maxClones || 5;
  const queue = new PQueue({ concurrency });

  const results = await Promise.allSettled(
    inputs.map(input => queue.add(() => executeAgent(agentId, input, userId)))
  );

  logger.info(`[AgentService] Swarm completed: ${results.length} tasks, concurrency=${concurrency}`);
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason.message });
};

const getAgentRuns = async (agentId, { page, limit }) => {
  // Placeholder implementation for traces module
  return [];
};

const getRunDetails = async (agentId, runId) => {
  // Placeholder implementation for traces module
  return {};
};

export const AgentService = {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  updateStatus,
  duplicateAgent,
  executeAgent,
  executeAgentStream,
  spawnSwarm,
  getAgentRuns,
  getRunDetails,
};
