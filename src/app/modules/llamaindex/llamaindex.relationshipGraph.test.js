import { vi, describe, it, expect, beforeEach } from 'vitest';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import DocumentRelationship from './llamaindex.relationship.model.js';
import { logger } from '../../../shared/logger.js';

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Google Generative AI
const generateContentMock = vi.fn();
const getGenerativeModelMock = vi.fn(() => ({
  generateContent: generateContentMock,
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: getGenerativeModelMock,
      };
    }),
  };
});

// Mock Mongoose Models
vi.mock('./llamaindex.metadata.model.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('./llamaindex.relationship.model.js', () => ({
  default: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

describe('llamaindex.relationshipGraph Service Tests', () => {
  const userId = 'user_12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildRelationshipGraph', () => {
    it('should return early if there are fewer than 2 documents (context boundary check)', async () => {
      DocumentMetadata.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ docId: 'doc1', userId }]),
      });

      const result = await relationshipGraphService.buildRelationshipGraph(userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(result).toEqual({
        success: true,
        message: 'At least 2 enriched documents are required to map relationships.',
        edgesCount: 0,
      });
      expect(DocumentRelationship.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should build relationship graph with overlap and Gemini analysis', async () => {
      const mockMetadata = [
        {
          docId: 'doc1',
          userId,
          fileName: 'Doc A',
          summary: 'Summary A',
          topics: ['AI', 'Machine Learning'],
          entities: ['Google', 'OpenAI'],
        },
        {
          docId: 'doc2',
          userId,
          fileName: 'Doc B',
          summary: 'Summary B',
          topics: ['Machine Learning', 'Deep Learning'],
          entities: ['Google', 'Meta'],
        },
      ];

      DocumentMetadata.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockMetadata),
      });

      DocumentRelationship.findOneAndUpdate.mockResolvedValue({});

      // Mock Gemini response
      const geminiResponseText = JSON.stringify([
        {
          pair: 'doc1 <-> doc2',
          relationType: 'dependency',
          confidence: 0.85,
          description: 'Doc A is a prerequisite for Doc B.',
        },
      ]);

      generateContentMock.mockResolvedValue({
        response: {
          text: () => geminiResponseText,
        },
      });

      const result = await relationshipGraphService.buildRelationshipGraph(userId);

      // Verify Jaccard & Overlap logic triggered findOneAndUpdate
      // Bidirectional updates = 2 calls
      // Gemini update = 1 call
      // Total expected edgesCount = 3
      expect(result.success).toBe(true);
      expect(result.edgesCount).toBe(3);

      // Verify context boundary: userId is enforced in database operations
      expect(DocumentRelationship.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId, sourceDocId: 'doc1', targetDocId: 'doc2' }),
        expect.any(Object),
        expect.any(Object)
      );

      expect(DocumentRelationship.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId, sourceDocId: 'doc2', targetDocId: 'doc1' }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle Gemini returning markdown-wrapped JSON blocks', async () => {
      const mockMetadata = [
        {
          docId: 'doc1',
          userId,
          fileName: 'Doc A',
          summary: 'Summary A',
          topics: ['AI'],
          entities: ['Google'],
        },
        {
          docId: 'doc2',
          userId,
          fileName: 'Doc B',
          summary: 'Summary B',
          topics: ['AI'],
          entities: ['Google'],
        },
      ];

      DocumentMetadata.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockMetadata),
      });

      DocumentRelationship.findOneAndUpdate.mockResolvedValue({});

      // Mock Gemini response wrapped in markdown
      const geminiResponseText = `\`\`\`json
[
  {
    "pair": "doc1 <-> doc2",
    "relationType": "hierarchical",
    "confidence": 0.9,
    "description": "Hierarchical structure detected."
  }
]
\`\`\``;

      generateContentMock.mockResolvedValue({
        response: {
          text: () => geminiResponseText,
        },
      });

      const result = await relationshipGraphService.buildRelationshipGraph(userId);

      expect(result.success).toBe(true);
      expect(result.edgesCount).toBe(3); // 2 overlap + 1 Gemini
    });

    it('should bypass Gemini linkage extraction if Gemini API throws an error', async () => {
      const mockMetadata = [
        {
          docId: 'doc1',
          userId,
          fileName: 'Doc A',
          summary: 'Summary A',
          topics: ['AI'],
          entities: ['Google'],
        },
        {
          docId: 'doc2',
          userId,
          fileName: 'Doc B',
          summary: 'Summary B',
          topics: ['AI'],
          entities: ['Google'],
        },
      ];

      DocumentMetadata.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockMetadata),
      });

      DocumentRelationship.findOneAndUpdate.mockResolvedValue({});
      generateContentMock.mockRejectedValue(new Error('Gemini API Quota Exceeded'));

      const result = await relationshipGraphService.buildRelationshipGraph(userId);

      // Should still succeed with overlap edges (2 edges)
      expect(result.success).toBe(true);
      expect(result.edgesCount).toBe(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'RelationshipGraph: Gemini linkage extraction bypassed:',
        'Gemini API Quota Exceeded'
      );
    });

    it('should throw an error if the database query fails', async () => {
      DocumentMetadata.find.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Database connection lost')),
      });

      await expect(
        relationshipGraphService.buildRelationshipGraph(userId)
      ).rejects.toThrow('Failed to compile relationship graph: Database connection lost');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('traverseGraph', () => {
    it('should traverse the graph using BFS up to specified depth', async () => {
      const startDocIds = ['doc1'];

      // Mock relationships
      // Depth 0: doc1 -> doc2
      // Depth 1: doc2 -> doc3
      DocumentRelationship.find
        .mockImplementationOnce(() => ({
          lean: vi.fn().mockResolvedValue([
            { userId, sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'topic_similarity' },
          ]),
        }))
        .mockImplementationOnce(() => ({
          lean: vi.fn().mockResolvedValue([
            { userId, sourceDocId: 'doc2', targetDocId: 'doc3', relationType: 'dependency' },
          ]),
        }));

      const result = await relationshipGraphService.traverseGraph(userId, startDocIds, 2);

      expect(result.success).toBe(true);
      expect(result.startingNodes).toEqual(['doc1']);
      expect(result.traversedNodes).toEqual(['doc1', 'doc2', 'doc3']);
      expect(result.edges).toHaveLength(2);
      expect(DocumentRelationship.find).toHaveBeenCalledTimes(2);
    });

    it('should respect the depth limit during traversal', async () => {
      const startDocIds = ['doc1'];

      DocumentRelationship.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { userId, sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'topic_similarity' },
        ]),
      });

      // Depth = 1 means we only process startDocIds (depth 0).
      // doc2 is added to queue with depth 1, but since currentDepth (1) >= depth (1), it is skipped.
      const result = await relationshipGraphService.traverseGraph(userId, startDocIds, 1);

      expect(result.success).toBe(true);
      expect(result.traversedNodes).toEqual(['doc1', 'doc2']);
      expect(DocumentRelationship.find).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if traversal database query fails', async () => {
      DocumentRelationship.find.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Query timeout')),
      });

      await expect(
        relationshipGraphService.traverseGraph(userId, ['doc1'], 1)
      ).rejects.toThrow('Query timeout');

      expect(logger.error).toHaveBeenCalledWith(
        'RelationshipGraph traverse failed:',
        expect.any(Error)
      );
    });
  });

  describe('Role-Based Access & Context Boundaries', () => {
    const roles = ['super_admin', 'admin', 'manager', 'user'];

    roles.forEach((role) => {
      it(`should execute buildRelationshipGraph successfully for role: ${role}`, async () => {
        // Context boundary: Ensure that regardless of the user's role,
        // the service correctly scopes queries to the provided userId.
        DocumentMetadata.find.mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        });

        const result = await relationshipGraphService.buildRelationshipGraph(`user_${role}`);
        expect(result.success).toBe(true);
        expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId: `user_${role}` });
      });

      it(`should execute traverseGraph successfully for role: ${role}`, async () => {
        DocumentRelationship.find.mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        });

        const result = await relationshipGraphService.traverseGraph(`user_${role}`, ['doc1'], 1);
        expect(result.success).toBe(true);
        expect(DocumentRelationship.find).toHaveBeenCalledWith({
          userId: `user_${role}`,
          sourceDocId: 'doc1',
        });
      });
    });
  });
});