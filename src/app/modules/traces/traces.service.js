import { logger } from '../../../shared/logger.js';
import Trace from './traces.model.js';
import mongoose from 'mongoose';

/**
 * Start a new trace
 */
const startTrace = async ({ type, sourceId, sourceName, triggerId, userId, input }) => {
  const trace = await Trace.create({
    type,
    sourceId,
    sourceName,
    triggerId,
    userId,
    input,
    status: 'running',
    startedAt: new Date(),
  });
  return trace.runId;
};

/**
 * Add a step to an existing trace
 */
const addStep = async (runId, step) => {
  const trace = await Trace.findOneAndUpdate(
    { runId },
    { $push: { steps: step } },
    { new: true }
  );
  return trace;
};

/**
 * Complete a trace, calculating duration, tokens, and estimated cost
 */
const completeTrace = async (runId, { status, output }) => {
  const trace = await Trace.findOne({ runId });
  if (!trace) throw new Error('Trace not found');

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - trace.startedAt.getTime();

  let totalTokens = { prompt: 0, completion: 0, total: 0 };
  let estimatedCost = 0;

  trace.steps.forEach(step => {
    if (step.tokensUsed) {
      totalTokens.prompt += step.tokensUsed.prompt || 0;
      totalTokens.completion += step.tokensUsed.completion || 0;
      totalTokens.total += step.tokensUsed.total || 0;

      const promptK = (step.tokensUsed.prompt || 0) / 1000;
      const compK = (step.tokensUsed.completion || 0) / 1000;
      
      // Calculate estimated cost
      if (step.model === 'gpt-oss-120b') {
        estimatedCost += (promptK + compK) * 0.0005;
      } else {
        estimatedCost += (promptK + compK) * 0.0001; // gpt-oss-20b default
      }
    }
  });

  trace.status = status;
  trace.output = output;
  trace.completedAt = completedAt;
  trace.durationMs = durationMs;
  trace.totalTokens = totalTokens;
  trace.estimatedCost = estimatedCost;

  await trace.save();
  return trace;
};

/**
 * Get trace details by runId
 */
const getTrace = async (runId) => {
  return await Trace.findOne({ runId });
};

/**
 * List paginated traces with filters
 */
const listTraces = async (userId, { page = 1, limit = 10, type, sourceId, status, startDate, endDate }) => {
  const query = { userId };
  if (type) query.type = type;
  if (sourceId) query.sourceId = sourceId;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.startedAt = {};
    if (startDate) query.startedAt.$gte = new Date(startDate);
    if (endDate) query.startedAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  const traces = await Trace.find(query)
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Trace.countDocuments(query);

  return {
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: traces,
  };
};

/**
 * Get aggregate dashboard stats
 */
const getDashboard = async (userId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Ensure userId is ObjectId for aggregate
  const userObjId = new mongoose.Types.ObjectId(userId);

  const stats = await Trace.aggregate([
    { $match: { userId: userObjId } },
    { $group: {
      _id: null,
      totalRuns: { $sum: 1 },
      completedRuns: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      avgDurationMs: { $avg: '$durationMs' },
      totalTokensUsed: { $sum: '$totalTokens.total' },
      totalEstimatedCost: { $sum: '$estimatedCost' },
    }}
  ]);

  const runsByDay = await Trace.aggregate([
    { $match: { userId: userObjId, startedAt: { $gte: thirtyDaysAgo } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
      count: { $sum: 1 }
    }},
    { $sort: { '_id': 1 } }
  ]);

  const topAgents = await Trace.aggregate([
    { $match: { userId: userObjId, type: 'agent' } },
    { $group: {
      _id: '$sourceId',
      sourceName: { $first: '$sourceName' },
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  const recentRuns = await Trace.find({ userId: userObjId })
    .sort({ startedAt: -1 })
    .limit(10)
    .select('runId type sourceName status startedAt durationMs estimatedCost');

  const baseStats = stats[0] || {
    totalRuns: 0,
    completedRuns: 0,
    avgDurationMs: 0,
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
  };

  return {
    totalRuns: baseStats.totalRuns,
    successRate: baseStats.totalRuns ? (baseStats.completedRuns / baseStats.totalRuns) * 100 : 0,
    avgDurationMs: baseStats.avgDurationMs || 0,
    totalTokensUsed: baseStats.totalTokensUsed || 0,
    totalEstimatedCost: baseStats.totalEstimatedCost || 0,
    runsByDay,
    topAgents,
    recentRuns,
  };
};

/**
 * Get specific agent analytics
 */
const getAgentAnalytics = async (agentId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const agentObjId = new mongoose.Types.ObjectId(agentId);

  const stats = await Trace.aggregate([
    { $match: { sourceId: agentObjId } },
    { $group: {
      _id: null,
      totalRuns: { $sum: 1 },
      completedRuns: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      failedRuns: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      avgDurationMs: { $avg: '$durationMs' },
      avgTokens: { $avg: '$totalTokens.total' },
    }}
  ]);

  const runsByDay = await Trace.aggregate([
    { $match: { sourceId: agentObjId, startedAt: { $gte: thirtyDaysAgo } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
      count: { $sum: 1 }
    }},
    { $sort: { '_id': 1 } }
  ]);

  const errors = await Trace.aggregate([
    { $match: { sourceId: agentObjId, status: 'failed' } },
    { $unwind: '$steps' },
    { $match: { 'steps.status': 'failed' } },
    { $group: {
      _id: '$steps.error',
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  const baseStats = stats[0] || {
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    avgDurationMs: 0,
    avgTokens: 0,
  };

  return {
    totalRuns: baseStats.totalRuns,
    successRate: baseStats.totalRuns ? (baseStats.completedRuns / baseStats.totalRuns) * 100 : 0,
    avgDurationMs: baseStats.avgDurationMs || 0,
    avgTokens: baseStats.avgTokens || 0,
    errorRate: baseStats.totalRuns ? (baseStats.failedRuns / baseStats.totalRuns) * 100 : 0,
    runsByDay,
    commonErrors: errors,
  };
};

/**
 * Get specific agent cost tracking
 */
const getAgentCosts = async (agentId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const agentObjId = new mongoose.Types.ObjectId(agentId);

  const costStats = await Trace.aggregate([
    { $match: { sourceId: agentObjId } },
    { $group: {
      _id: null,
      totalCost: { $sum: '$estimatedCost' },
      totalRuns: { $sum: 1 },
    }}
  ]);

  const costByDay = await Trace.aggregate([
    { $match: { sourceId: agentObjId, startedAt: { $gte: thirtyDaysAgo } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
      cost: { $sum: '$estimatedCost' }
    }},
    { $sort: { '_id': 1 } }
  ]);

  const tokensByModel = await Trace.aggregate([
    { $match: { sourceId: agentObjId } },
    { $unwind: '$steps' },
    { $group: {
      _id: '$steps.model',
      tokens: { $sum: '$steps.tokensUsed.total' }
    }},
    { $match: { _id: { $ne: null } } }
  ]);

  const base = costStats[0] || { totalCost: 0, totalRuns: 0 };

  return {
    totalCost: base.totalCost,
    avgCostPerRun: base.totalRuns ? (base.totalCost / base.totalRuns) : 0,
    costByDay,
    tokensByModel,
  };
};

/**
 * Add user feedback to a specific trace
 */
const addFeedback = async (runId, { rating, comment }) => {
  return await Trace.findOneAndUpdate(
    { runId },
    { feedback: { rating, comment, createdAt: new Date() } },
    { new: true }
  );
};

/**
 * Delete a trace
 */
const deleteTrace = async (runId) => {
  return await Trace.findOneAndDelete({ runId });
};

/**
 * Export traces matching filters
 */
const exportTraces = async (userId, { format = 'json', startDate, endDate }) => {
  const query = { userId };
  if (startDate || endDate) {
    query.startedAt = {};
    if (startDate) query.startedAt.$gte = new Date(startDate);
    if (endDate) query.startedAt.$lte = new Date(endDate);
  }

  const traces = await Trace.find(query).sort({ startedAt: -1 }).lean();

  if (format === 'csv') {
    if (traces.length === 0) return 'runId,type,sourceName,status,startedAt,durationMs,estimatedCost\n';
    
    const header = 'runId,type,sourceName,status,startedAt,durationMs,estimatedCost\n';
    const rows = traces.map(t => 
      `${t.runId},${t.type},"${t.sourceName || ''}",${t.status},${t.startedAt},${t.durationMs || ''},${t.estimatedCost || 0}`
    ).join('\n');
    return header + rows;
  }

  return traces;
};

export const TraceService = {
  startTrace,
  addStep,
  completeTrace,
  getTrace,
  listTraces,
  getDashboard,
  getAgentAnalytics,
  getAgentCosts,
  addFeedback,
  deleteTrace,
  exportTraces,
};
