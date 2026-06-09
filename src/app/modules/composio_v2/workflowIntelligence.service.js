import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ActionAuditLog from './models/actionAuditLog.model.js';
import WorkflowPattern from './models/workflowPattern.model.js';

/**
 * Initializes the Google Generative AI client with the API key from configuration.
 * If `config.gemini_secret_key` is not available, it defaults to 'mock-key'.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key || 'mock-key');

/**
 * Maximum allowed time gap in milliseconds between two consecutive actions
 * for them to be considered part of the same user session.
 * Currently set to 5 minutes (5 * 60 * 1000 ms).
 * @type {number}
 */
const SESSION_GAP_MS = 5 * 60 * 1000;

/**
 * Minimum number of times a specific sequence of actions must appear
 * within the analysis window to be considered a significant workflow pattern.
 * @type {number}
 */
const MIN_OCCURRENCES = 2;

/**
 * The duration in days for which past action audit logs are analyzed
 * to detect recurring workflow patterns.
 * Currently set to 30 days.
 * @type {number}
 */
const ANALYSIS_WINDOW_DAYS = 30;

/**
 * Groups a flat list of chronologically sorted audit log entries into distinct user sessions.
 * A session is defined as a sequence of actions where no two consecutive actions
 * are separated by more than `SESSION_GAP_MS`. Sessions with fewer than 2 actions are discarded.
 *
 * @param {Array<Object>} logs - An array of action audit log objects, expected to be sorted by `createdAt` in ascending order.
 * @param {Date} logs[].createdAt - The timestamp when the action was created.
 * @returns {Array<Array<Object>>} An array of arrays, where each inner array represents a session
 *                                  and contains the audit log entries belonging to that session.
 */
const groupIntoSessions = (logs) => {
  if (logs.length === 0) return [];

  const sessions = [];
  let currentSession = [logs[0]];

  for (let i = 1; i < logs.length; i++) {
    // Optimization: createdAt is already a Date object from Mongoose's .lean(),
    // so direct .getTime() is slightly more efficient than new Date().getTime().
    const prevTime = logs[i - 1].createdAt.getTime();
    const currTime = logs[i].createdAt.getTime();

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
 * Generates all possible sliding window sub-sequences of length 2 and 3
 * from a given session's sequence of tool/action slugs.
 *
 * @param {Array<Object>} session - An array of action audit log objects representing a single user session.
 * @param {string} session[].toolSlug - The unique slug for the tool used (e.g., 'google_calendar_create_event').
 * @param {string} session[].app - The application name if `toolSlug` is not available.
 * @param {string} session[].action - The action name if `toolSlug` is not available.
 * @returns {Array<Array<string>>} An array of arrays, where each inner array is a sub-sequence of tool/action slugs.
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
 * Uses the Gemini AI model to generate a human-readable title and a compelling suggestion
 * for automating a detected workflow pattern.
 *
 * @param {Array<string>} sequence - The array of tool/action slugs representing the workflow pattern.
 * @param {number} occurrenceCount - The number of times this sequence has been observed.
 * @param {number} successRate - The success rate of this sequence (expected to be 100 for this analysis).
 * @param {number} avgLatencyMs - The average duration in milliseconds for a single run of this sequence.
 * @returns {Promise<{title: string, suggestion: string}>} An object containing a short title and a detailed suggestion for automation.
 * @throws {Error} If the Gemini API call fails or returns an unparseable response.
 */
const generateGeminiSuggestion = async (sequence, occurrenceCount, successRate, avgLatencyMs) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
 * Mines the last `ANALYSIS_WINDOW_DAYS` of successful `ActionAuditLog` entries for a given user
 * to detect recurring tool-call sequences (workflow patterns).
 *
 * It groups actions into sessions, extracts sub-sequences of length 2 and 3,
 * counts their occurrences, and filters for patterns appearing at least `MIN_OCCURRENCES` times.
 * For the top 10 significant patterns, it generates human-readable suggestions using Gemini AI
 * and persists these patterns in the `WorkflowPattern` model.
 *
 * @param {string} userId - The ID of the user for whom to analyze workflow patterns.
 * @returns {Promise<Object>} An object containing the analysis result, including detected patterns.
 * @returns {boolean} returns.success - Indicates if the analysis was successful.
 * @returns {string} returns.message - A descriptive message about the analysis outcome.
 * @returns {string} returns.analysisWindow - The duration of the analysis window (e.g., "30 days").
 * @returns {number} returns.totalLogsAnalyzed - The total number of audit logs considered.
 * @returns {number} returns.totalSessionsAnalyzed - The total number of sessions identified.
 * @returns {number} returns.patternsDetected - The number of significant patterns found and saved.
 * @returns {Array<Object>} returns.patterns - An array of detected workflow pattern objects.
 * @returns {string} returns.patterns[].id - The unique ID of the saved workflow pattern.
 * @returns {string} returns.patterns[].patternTitle - A human-readable title for the pattern.
 * @returns {Array<string>} returns.patterns[].sequence - The sequence of tool/action slugs.
 * @returns {number} returns.patterns[].occurrenceCount - How many times the pattern was observed.
 * @returns {number} returns.patterns[].successRate - The success rate of the pattern (always 100 for this analysis).
 * @returns {number} returns.patterns[].avgSequenceLatencyMs - Average duration of the pattern in milliseconds.
 * @returns {number} returns.patterns[].estimatedTimeSavingsMs - Estimated time savings from automating this pattern.
 * @returns {string} returns.patterns[].geminiSuggestion - The AI-generated suggestion for automation.
 */
const analyzeWorkflowPatterns = async (userId) => {
  logger.info(`WorkflowIntelligence: starting pattern analysis for user ${userId}`);

  const since = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Fetch successful logs in chronological order
  // Optimization: Add a compound index on ActionAuditLog for { userId: 1, status: 1, createdAt: 1 }
  // This index will efficiently support the query's filtering (userId, status, createdAt) and sorting (createdAt).
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
      analysisWindow: `${ANALYSIS_WINDOW_DAYS} days`,
      totalLogsAnalyzed: logs.length,
      totalSessionsAnalyzed: 0, // No sessions if not enough logs
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
      analysisWindow: `${ANALYSIS_WINDOW_DAYS} days`,
      totalLogsAnalyzed: logs.length,
      totalSessionsAnalyzed: 0,
      patternsDetected: 0,
      patterns: [],
    };
  }

  // Count all sub-sequences and track their durations
  // FIX: The original code incorrectly calculated avgSequenceLatencyMs by summing individual action durations.
  // It should be the elapsed time from the first action's start to the last action's start in the sequence.
  const sequenceData = new Map(); // Stores { count: N, totalDurationMs: M }

  for (const session of sessions) {
    const slugs = session.map(log => log.toolSlug || `${log.app}_${log.action}`);

    // Length-2 and length-3 sequences
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= slugs.length - len; i++) {
        const currentSeqSlugs = slugs.slice(i, i + len);
        const key = currentSeqSlugs.join('|');

        // Get the actual log objects for this specific sequence occurrence within the session
        const firstLog = session[i];
        const lastLog = session[i + len - 1];

        // Calculate the duration of this specific sequence occurrence
        // The duration of a sequence is the time elapsed from the createdAt of its first action
        // to the createdAt of its last action.
        // Optimization: createdAt is already a Date object from Mongoose's .lean(),
        // so direct .getTime() is slightly more efficient than new Date().getTime().
        const sequenceDuration = lastLog.createdAt.getTime() - firstLog.createdAt.getTime();

        if (!sequenceData.has(key)) {
          sequenceData.set(key, { count: 0, totalDurationMs: 0 });
        }
        const data = sequenceData.get(key);
        data.count++;
        data.totalDurationMs += sequenceDuration;
      }
    }
  }

  // Filter to patterns meeting the minimum occurrence threshold
  const significantPatterns = [];
  for (const [key, data] of sequenceData.entries()) {
    if (data.count >= MIN_OCCURRENCES) {
      const seq = key.split('|');
      const avgLatencyMs = data.count > 0 ? data.totalDurationMs / data.count : 0;

      significantPatterns.push({
        sequence: seq,
        occurrenceCount: data.count,
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
    // Optimization: Add a compound index on WorkflowPattern for { userId: 1, sequence: 1 }
    // This index will efficiently support the upsert query's filtering by userId and sequence.
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
 * Retrieves all non-dismissed workflow patterns previously detected and saved for a specific user.
 * Patterns are sorted by `occurrenceCount` in descending order.
 *
 * @param {string} userId - The ID of the user whose workflow patterns are to be retrieved.
 * @returns {Promise<Object>} An object containing the retrieved patterns.
 * @returns {boolean} returns.success - Indicates if the retrieval was successful.
 * @returns {number} returns.count - The number of patterns retrieved.
 * @returns {Array<Object>} returns.patterns - An array of workflow pattern objects.
 * @returns {string} returns.patterns[].id - The unique ID of the workflow pattern.
 * @returns {string} returns.patterns[].patternTitle - A human-readable title for the pattern.
 * @returns {Array<string>} returns.patterns[].sequence - The sequence of tool/action slugs.
 * @returns {number} returns.patterns[].occurrenceCount - How many times the pattern was observed.
 * @returns {number} returns.patterns[].successRate - The success rate of the pattern.
 * @returns {number} returns.patterns[].avgSequenceLatencyMs - Average duration of the pattern in milliseconds.
 * @returns {number} returns.patterns[].estimatedTimeSavingsMs - Estimated time savings from automating this pattern.
 * @returns {string} returns.patterns[].geminiSuggestion - The AI-generated suggestion for automation.
 * @returns {Date} returns.patterns[].lastObservedAt - The last time this pattern was observed or updated.
 */
const getWorkflowPatterns = async (userId) => {
  // Optimization: Add a compound index on WorkflowPattern for { userId: 1, dismissed: 1, occurrenceCount: -1 }
  // This index will efficiently support the query's filtering (userId, dismissed) and sorting (occurrenceCount).
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
 * Marks a specific workflow pattern suggestion as dismissed for a user.
 * Dismissed patterns will no longer be returned by `getWorkflowPatterns`.
 *
 * @param {string} patternId - The unique ID of the workflow pattern to dismiss.
 * @param {string} userId - The ID of the user who owns the pattern.
 * @returns {Promise<Object>} An object indicating the success of the dismissal operation.
 * @returns {boolean} returns.success - True if the pattern was successfully dismissed.
 * @returns {string} returns.message - A confirmation message.
 */
const dismissPattern = async (patternId, userId) => {
  // _id is already indexed by default. userId is used for ownership check.
  // No additional index is strictly necessary here for performance, as _id is unique.
  await WorkflowPattern.findOneAndUpdate(
    { _id: patternId, userId },
    { dismissed: true }
  );
  return { success: true, message: 'Pattern suggestion dismissed.' };
};

/**
 * Service module for workflow intelligence, providing functions to analyze user actions,
 * detect recurring patterns, generate automation suggestions, and manage these patterns.
 * @namespace workflowIntelligenceService
 */
export const workflowIntelligenceService = {
  /**
   * Initiates the analysis of user action logs to detect and suggest workflow automation patterns.
   * @function analyzeWorkflowPatterns
   * @memberof workflowIntelligenceService
   * @see {@link analyzeWorkflowPatterns}
   */
  analyzeWorkflowPatterns,
  /**
   * Retrieves all active (non-dismissed) workflow patterns for a given user.
   * @function getWorkflowPatterns
   * @memberof workflowIntelligenceService
   * @see {@link getWorkflowPatterns}
   */
  getWorkflowPatterns,
  /**
   * Marks a specific workflow pattern as dismissed for a user.
   * @function dismissPattern
   * @memberof workflowIntelligenceService
   * @see {@link dismissPattern}
   */
  dismissPattern,
};