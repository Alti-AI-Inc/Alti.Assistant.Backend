import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowIntelligenceService } from './workflowIntelligence.service.js';
import ActionAuditLog from './models/actionAuditLog.model.js';
import WorkflowPattern from './models/workflowPattern.model.js';
import { logger } from '../../../shared/logger.js';
import { VertexAI } from '@google-cloud/vertexai';

// Mock dependencies
vi.mock('./models/actionAuditLog.model.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('./models/workflowPattern.model.js', () => ({
  default: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGenerateContent = vi.fn();
const {
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  return {
    mockGetGenerativeModel
  };
});

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Helper to create a date in the past
const dateMinutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

describe('workflowIntelligenceService', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock chaining for Mongoose queries
    ActionAuditLog.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn(),
    });

    WorkflowPattern.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeWorkflowPatterns', () => {
    it('should return early if there is insufficient action history', async () => {
      const logs = [
        { toolSlug: 'a', createdAt: dateMinutesAgo(10) },
        { toolSlug: 'b', createdAt: dateMinutesAgo(9) },
      ];
      ActionAuditLog.find().sort().lean.mockResolvedValue(logs);

      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Insufficient action history');
      expect(result.totalLogsAnalyzed).toBe(2);
      expect(result.patternsDetected).toBe(0);
      expect(ActionAuditLog.find).toHaveBeenCalledWith({
        userId,
        status: 'success',
        createdAt: { $gte: expect.any(Date) },
      });
    });

    it('should return if no multi-step sessions are detected', async () => {
      const logs = [
        { toolSlug: 'a', createdAt: dateMinutesAgo(30) },
        { toolSlug: 'b', createdAt: dateMinutesAgo(20) },
        { toolSlug: 'c', createdAt: dateMinutesAgo(10) },
        { toolSlug: 'd', createdAt: dateMinutesAgo(1) },
      ];
      ActionAuditLog.find().sort().lean.mockResolvedValue(logs);

      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No multi-step sessions detected');
      expect(result.totalLogsAnalyzed).toBe(4);
      expect(result.totalSessionsAnalyzed).toBe(0);
      expect(result.patternsDetected).toBe(0);
    });

    it('should successfully analyze logs, find patterns, and save them', async () => {
      const now = Date.now();
      const logs = [
        // Session 1, Pattern: a -> b -> c (occurs twice)
        { toolSlug: 'a', createdAt: new Date(now - 6 * 60000) },
        { toolSlug: 'b', createdAt: new Date(now - 5 * 60000) },
        { toolSlug: 'c', createdAt: new Date(now - 4 * 60000) },
        // Gap > 5 mins
        // Session 2, Pattern: a -> b -> c (occurs twice)
        { toolSlug: 'a', createdAt: new Date(now - 2 * 60000) },
        { toolSlug: 'b', createdAt: new Date(now - 1 * 60000) },
        { toolSlug: 'c', createdAt: new Date(now - 0.5 * 60000) },
        // Session 3, Pattern: d -> e (occurs once, should be ignored)
        { toolSlug: 'd', createdAt: new Date(now - 30000) },
        { toolSlug: 'e', createdAt: new Date(now - 20000) },
      ];
      ActionAuditLog.find().sort().lean.mockResolvedValue(logs);

      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  title: 'Automate A to C',
                  suggestion: 'You do this a lot. Automate it!',
                }),
              }],
            },
          }],
        },
      });

      const mockSavedPattern = {
        _id: 'pattern-id-1',
        patternTitle: 'Automate A to C',
        sequence: ['a', 'b', 'c'],
        occurrenceCount: 2,
        successRate: 100,
        avgSequenceLatencyMs: 120000,
        estimatedTimeSavingsMs: 84000,
        geminiSuggestion: 'You do this a lot. Automate it!',
      };
      WorkflowPattern.findOneAndUpdate.mockResolvedValue(mockSavedPattern);

      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 workflow automation opportunities detected');
      expect(result.totalLogsAnalyzed).toBe(8);
      expect(result.totalSessionsAnalyzed).toBe(3);
      expect(result.patternsDetected).toBe(1);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].sequence).toEqual(['a', 'b', 'c']);
      expect(result.patterns[0].occurrenceCount).toBe(2);

      // Check if Gemini was called for the significant pattern
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Tool Sequence: a → b → c'),
              }),
            ]),
          }),
        ]),
      }));

      // Check if the pattern was upserted
      expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledWith({
        userId,
        sequence: ['a', 'b', 'c'],
      }, {
        $set: expect.objectContaining({
          occurrenceCount: 2,
          patternTitle: 'Automate A to C',
          geminiSuggestion: 'You do this a lot. Automate it!',
        }),
      }, { upsert: true, new: true });
    });

    it('should handle Gemini API failures gracefully with a fallback suggestion', async () => {
      const logs = [
        { toolSlug: 'x', createdAt: dateMinutesAgo(4) },
        { toolSlug: 'y', createdAt: dateMinutesAgo(3) },
        { toolSlug: 'x', createdAt: dateMinutesAgo(2) },
        { toolSlug: 'y', createdAt: dateMinutesAgo(1) },
      ];
      ActionAuditLog.find().sort().lean.mockResolvedValue(logs);

      // Simulate Gemini failure
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      const mockSavedPattern = {
        _id: 'pattern-id-fallback',
        patternTitle: 'x → y Automation',
        sequence: ['x', 'y'],
        occurrenceCount: 2,
        geminiSuggestion: "You've performed x → y 2 times. Automating this could save significant time.",
      };
      WorkflowPattern.findOneAndUpdate.mockResolvedValue(mockSavedPattern);

      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

      expect(result.success).toBe(true);
      expect(result.patternsDetected).toBe(1);
      expect(result.patterns[0].patternTitle).toBe('x → y Automation');
      expect(result.patterns[0].geminiSuggestion).toContain('Automating this could save significant time.');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Gemini suggestion failed for x→y: API Error'));
    });

    it('should correctly calculate average sequence latency', async () => {
      const now = Date.now();
      const logs = [
        // Sequence 1: a -> b, duration = 60s
        { toolSlug: 'a', createdAt: new Date(now - 180000) },
        { toolSlug: 'b', createdAt: new Date(now - 120000) },
        // Sequence 2: a -> b, duration = 30s
        { toolSlug: 'a', createdAt: new Date(now - 45000) },
        { toolSlug: 'b', createdAt: new Date(now - 15000) },
      ];
      ActionAuditLog.find().sort().lean.mockResolvedValue(logs);
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: '{"title":"T","suggestion":"S"}' }] } }] }
      });
      WorkflowPattern.findOneAndUpdate.mockResolvedValue({ _id: 'p1' });

      await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

      const expectedAvgLatency = ((120000 - 180000) + (15000 - 45000)) / 2; // (60000 + 30000) / 2 = 45000
      expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object), {
          $set: expect.objectContaining({
            avgSequenceLatencyMs: expectedAvgLatency,
          }),
        },
        expect.any(Object)
      );
    });

    it('should use app_action as a fallback for toolSlug', async () => {
        const logs = [
            { app: 'google', action: 'send_email', createdAt: dateMinutesAgo(4) },
            { toolSlug: 'salesforce_create_contact', createdAt: dateMinutesAgo(3) },
            { app: 'google', action: 'send_email', createdAt: dateMinutesAgo(2) },
            { toolSlug: 'salesforce_create_contact', createdAt: dateMinutesAgo(1) },
        ];
        ActionAuditLog.find().sort().lean.mockResolvedValue(logs);
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: '{"title":"T","suggestion":"S"}' }] } }] }
        });
        WorkflowPattern.findOneAndUpdate.mockResolvedValue({ _id: 'p1' });

        await workflowIntelligenceService.analyzeWorkflowPatterns(userId);

        expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledWith(
            { userId, sequence: ['google_send_email', 'salesforce_create_contact'] },
            expect.any(Object),
            expect.any(Object)
        );
    });
  });

  describe('getWorkflowPatterns', () => {
    it('should retrieve all non-dismissed patterns for a user', async () => {
      const mockPatterns = [{
        _id: 'pattern-1',
        patternTitle: 'Automate Gmail to Salesforce',
        sequence: ['gmail_send', 'sf_create'],
        occurrenceCount: 15,
        successRate: 100,
        avgSequenceLatencyMs: 30000,
        estimatedTimeSavingsMs: 21000,
        geminiSuggestion: 'Automate this!',
        lastObservedAt: new Date(),
        dismissed: false,
      }, ];
      WorkflowPattern.find().sort().lean.mockResolvedValue(mockPatterns);

      const result = await workflowIntelligenceService.getWorkflowPatterns(userId);

      expect(WorkflowPattern.find).toHaveBeenCalledWith({ userId, dismissed: false });
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].id).toBe('pattern-1');
      expect(result.patterns[0].patternTitle).toBe('Automate Gmail to Salesforce');
      // Ensure lean object properties are mapped correctly
      expect(result.patterns[0]).not.toHaveProperty('_id');
      expect(result.patterns[0]).toHaveProperty('id');
    });

    it('should return an empty array if no patterns are found', async () => {
      WorkflowPattern.find().sort().lean.mockResolvedValue([]);

      const result = await workflowIntelligenceService.getWorkflowPatterns(userId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.patterns).toEqual([]);
    });
  });

  describe('dismissPattern', () => {
    it('should update the specified pattern to be dismissed for the correct user', async () => {
      const patternId = 'pattern-to-dismiss-123';
      WorkflowPattern.findOneAndUpdate.mockResolvedValue({ nModified: 1 });

      const result = await workflowIntelligenceService.dismissPattern(patternId, userId);

      expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledWith({
        _id: patternId,
        userId: userId, // Verifies the context boundary/ownership check
      }, {
        dismissed: true
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Pattern suggestion dismissed.');
    });

    it('should not fail if the pattern to dismiss does not exist', async () => {
        const patternId = 'non-existent-pattern';
        // findOneAndUpdate returns null if no document is found and updated
        WorkflowPattern.findOneAndUpdate.mockResolvedValue(null);

        const result = await workflowIntelligenceService.dismissPattern(patternId, userId);

        expect(WorkflowPattern.findOneAndUpdate).toHaveBeenCalledWith({
            _id: patternId,
            userId: userId,
        }, {
            dismissed: true
        });
        expect(result.success).toBe(true);
        expect(result.message).toBe('Pattern suggestion dismissed.');
    });
  });
});