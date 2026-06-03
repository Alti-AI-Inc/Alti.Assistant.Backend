import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ActionAuditLog from './models/actionAuditLog.model.js';
import WorkflowPattern from './models/workflowPattern.model.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key || 'mock-key');

// Maximum gap in milliseconds between actions in a session (5 minutes)
const SESSION_GAP_MS = 5 * 60 * 1000;

// Minimum number of times a sequence must appear to be considered a pattern
const MIN_OCCURRENCES = 2;

// Analysis window: last 30 days
const ANALYSIS_WINDOW_DAYS = 30;

/**
 * Groups a flat list of audit log entries into sessions.
 * A "session" is a sequence of actions where no two consecutive actions
 * are more than SESSION_GAP_MS apart.
 */
const groupIntoSessions = (logs) => {
  if (logs.length === 0) return [];

  const sessions = [];
  let currentSession = [logs[0]];

  for (let i = 1; i < logs.length; i++) {
    const prevTime = new Date(logs[i - 1].createdAt).getTime();
    const currTime = new Date(logs[i].createdAt).getTime();

    if (currTime - prevTime <= SESSION_GAP_MS) {
      currentSession.push(logs[i]);
    } else {
      if (currentSession.length >= 2) {
        sessions.push(currentSession);
      }
      currentSession = [logs[i]];
    }
  }

  if (currentSession.length >= 2) {
    sessions.push(currentSession);
  }

  return sessions;
};

/**
 * Generate sliding window sub-sequences of length 2 and 3 from a session.
 */
const extractSubSequences = (session) => {
  const sequences = [];
  const slugs = session.map(log => log.toolSlug || `${log.app}_${log.action}`);

  // Length-2 and length-3 sequences
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= slugs.length - len; i++) {
      sequences.push(slugs.slice(i, i + len));
    }
  }

  return sequences;
};

/**
 * Use Gemini to generate a human-readable suggestion for a workflow pattern.
 */
const generateGeminiSuggestion = async (sequence, occurrenceCount, successRate, avgLatencyMs) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `You are an expert workflow automation consultant. 
A user has repeatedly performed the following sequence of actions ${occurrenceCount} times:

Tool Sequence: ${sequence.join(' → ')}
Success Rate: ${successRate}%
Average Duration: ${Math.round(avgLatencyMs / 1000)}s per sequence run

Generate:
1. A short, catchy title for this automation opportunity (max 8 words)
2. A compelling, friendly 2-3 sentence suggestion explaining why automating this workflow would save time and improve productivity

Return ONLY a JSON object with this exact structure (no markdown):
{
  "title": "Your short title here",
  "suggestion": "Your 2-3 sentence suggestion here"
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    });

    let text = result.response.text().trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    }

    const parsed = JSON.parse(text);
    return {
      title: parsed.title || sequence.join(' → '),
      suggestion: parsed.suggestion || `You frequently perform ${sequence.join(' → ')}. Consider automating this workflow.`,
    };
  } catch (err) {
    logger.warn(`WorkflowIntelligence: Gemini suggestion failed for ${sequence.join('→')}: ${err.message}`);
    return {
      title: `${sequence[0]} → ${sequence[sequence.length - 1]} Automation`,
      suggestion: `You've performed ${sequence.join(' → ')} ${occurrenceCount} times. Automating this could save significant time.`,
    };
  }
};

/**
 * Mine the last 30 days of ActionAuditLog for recurring tool-call sequences.
 * Detects patterns appearing MIN_OCCURRENCES+ times and generates Gemini suggestions.
 *
 * @param {string|ObjectId} userId
 * @returns {Object} Mining result with detected patterns
 */
const analyzeWorkflowPatterns = async (userId) => {
  logger.info(`WorkflowIntelligence: starting pattern analysis for user ${userId}`);

  const since = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Fetch successful logs in chronological order
  const logs = await ActionAuditLog.find({
    userId,
    status: 'success',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (logs.length < 4) {
    return {
      success: true,
      message: 'Insufficient action history for pattern analysis. Execute more tool actions to build a behavioral profile.',
      patternsDetected: 0,
      patterns: [],
    };
  }

  // Group into sessions
  const sessions = groupIntoSessions(logs);
  logger.info(`WorkflowIntelligence: found ${sessions.length} sessions from ${logs.length} actions`);

  if (sessions.length === 0) {
    return {
      success: true,
      message: 'No multi-step sessions detected. All actions were isolated without temporal grouping.',
      patternsDetected: 0,
      patterns: [],
    };
  }

  // Count all sub-sequences
  const sequenceCounts = new Map();
  const sequenceSuccessData = new Map();

  for (const session of sessions) {
    const subSeqs = extractSubSequences(session);
    for (const seq of subSeqs) {
      const key = seq.join('|');
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);

      // Track duration for the sequence
      if (!sequenceSuccessData.has(key)) {
        sequenceSuccessData.set(key, { totalMs: 0, count: 0 });
      }
      const data = sequenceSuccessData.get(key);
      // Estimate sequence duration from session action durations
      const relevantLogs = session.filter(log => seq.includes(log.toolSlug || `${log.app}_${log.action}`));
      const totalMs = relevantLogs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
      data.totalMs += totalMs;
      data.count++;
    }
  }

  // Filter to patterns meeting the minimum occurrence threshold
  const significantPatterns = [];
  for (const [key, count] of sequenceCounts.entries()) {
    if (count >= MIN_OCCURRENCES) {
      const seq = key.split('|');
      const perfData = sequenceSuccessData.get(key) || { totalMs: 0, count: 1 };
      const avgLatencyMs = perfData.count > 0 ? perfData.totalMs / perfData.count : 0;

      significantPatterns.push({
        sequence: seq,
        occurrenceCount: count,
        successRate: 100, // All drawn from success logs
        avgSequenceLatencyMs: Math.round(avgLatencyMs),
        estimatedTimeSavingsMs: Math.round(avgLatencyMs * 0.7), // Automation saves ~70% of manual time
      });
    }
  }

  // Sort by occurrence count descending
  significantPatterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  // Take top 10 patterns
  const topPatterns = significantPatterns.slice(0, 10);

  logger.info(`WorkflowIntelligence: generating Gemini suggestions for ${topPatterns.length} patterns`);

  // Generate Gemini suggestions and persist
  const savedPatterns = [];
  for (const pattern of topPatterns) {
    const geminiResult = await generateGeminiSuggestion(
      pattern.sequence,
      pattern.occurrenceCount,
      pattern.successRate,
      pattern.avgSequenceLatencyMs
    );

    // Upsert the pattern
    const saved = await WorkflowPattern.findOneAndUpdate(
      { userId, sequence: pattern.sequence },
      {
        $set: {
          occurrenceCount: pattern.occurrenceCount,
          successRate: pattern.successRate,
          avgSequenceLatencyMs: pattern.avgSequenceLatencyMs,
          estimatedTimeSavingsMs: pattern.estimatedTimeSavingsMs,
          geminiSuggestion: geminiResult.suggestion,
          patternTitle: geminiResult.title,
          lastObservedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    savedPatterns.push({
      id: saved._id,
      patternTitle: saved.patternTitle,
      sequence: saved.sequence,
      occurrenceCount: saved.occurrenceCount,
      successRate: saved.successRate,
      avgSequenceLatencyMs: saved.avgSequenceLatencyMs,
      estimatedTimeSavingsMs: saved.estimatedTimeSavingsMs,
      geminiSuggestion: saved.geminiSuggestion,
    });
  }

  return {
    success: true,
    message: `Pattern intelligence analysis complete. ${savedPatterns.length} workflow automation opportunities detected.`,
    analysisWindow: `${ANALYSIS_WINDOW_DAYS} days`,
    totalLogsAnalyzed: logs.length,
    totalSessionsAnalyzed: sessions.length,
    patternsDetected: savedPatterns.length,
    patterns: savedPatterns,
  };
};

/**
 * Get previously detected patterns for a user.
 */
const getWorkflowPatterns = async (userId) => {
  const patterns = await WorkflowPattern.find({ userId, dismissed: false })
    .sort({ occurrenceCount: -1 })
    .lean();

  return {
    success: true,
    count: patterns.length,
    patterns: patterns.map(p => ({
      id: p._id,
      patternTitle: p.patternTitle,
      sequence: p.sequence,
      occurrenceCount: p.occurrenceCount,
      successRate: p.successRate,
      avgSequenceLatencyMs: p.avgSequenceLatencyMs,
      estimatedTimeSavingsMs: p.estimatedTimeSavingsMs,
      geminiSuggestion: p.geminiSuggestion,
      lastObservedAt: p.lastObservedAt,
    })),
  };
};

/**
 * Dismiss a workflow pattern suggestion.
 */
const dismissPattern = async (patternId, userId) => {
  await WorkflowPattern.findOneAndUpdate(
    { _id: patternId, userId },
    { dismissed: true }
  );
  return { success: true, message: 'Pattern suggestion dismissed.' };
};

export const workflowIntelligenceService = {
  analyzeWorkflowPatterns,
  getWorkflowPatterns,
  dismissPattern,
};
