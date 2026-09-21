import crypto from 'crypto';
import { groqChat, groqStream, groqToolCall } from '../../services/groq.client.js';
import { logger } from '../../../shared/logger.js';
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

  const systemPrompt = agent.instructions;
  let ragContext = '';

  if (agent.knowledgeBases && agent.knowledgeBases.length > 0) {
    // Assuming a call to a RAG service here
    // ragContext = await queryRAG(agent.knowledgeBases, input);
    ragContext = ' [RAG Context Placeholder] ';
  }

  const messages = [
    { role: 'system', content: `${systemPrompt}\n${ragContext}` },
    { role: 'user', content: input }
  ];

  let output = '';
  let toolCalls = [];
  let tokensUsed = 0; // Requires true integration tracking

  if (agent.tools && agent.tools.length > 0) {
    const toolCallRes = await groqToolCall(messages, agent.model, agent.tools);
    output = toolCallRes?.content || 'Tool execution result';
  } else {
    const chatRes = await groqChat(messages, agent.model);
    output = chatRes?.content || 'Chat execution result';
  }

  const durationMs = Date.now() - startTime;

  agent.metadata.totalRuns += 1;
  agent.metadata.lastRunAt = new Date();
  await agent.save();

  return {
    runId: crypto.randomUUID(),
    output,
    model: agent.model,
    tokensUsed,
    durationMs,
    toolCalls,
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

  const stream = await groqStream(messages, agent.model);
  return stream;
};

const spawnSwarm = async (agentId, inputs, userId) => {
  const results = await Promise.allSettled(
    inputs.map(input => executeAgent(agentId, input, userId))
  );
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
