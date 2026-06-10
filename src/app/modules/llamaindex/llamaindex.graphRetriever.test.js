import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphRetrieverService } from './llamaindex.graphRetriever.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('./llamaindex.metadata.model.js', () => ({
  default: {
    find: vi.fn(() => ({
      lean: vi.fn(),
    })),
  },
}));

vi.mock('./llamaindex.relationshipGraph.js', () => ({
  relationshipGraphService: {
    traverseGraph: vi.fn(),
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('graphRetrieverService', () => {
  const userId = 'testUser123';
  const query = 'What is the project status?';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('getGraphEnrichedQueryContext', () => {
    // Helper function to mock DocumentMetadata.find().lean()
    const mockDocumentMetadata = (data) => {
      DocumentMetadata.find().lean.mockResolvedValue(data);
    };

    // Helper function to mock relationshipGraphService.traverseGraph()
    const mockTraverseGraph = (data) => {
      relationshipGraphService.traverseGraph.mockResolvedValue(data);
    };

    it('should return the original query if less than 2 documents are found for the user', async () => {
      mockDocumentMetadata([]);
      let result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);
      expect(result).toBe(query);

      mockDocumentMetadata([
        { docId: 'doc1', fileName: 'file1.pdf', topics: ['topicA'], entities: ['entityX'], summary: 'summary1' },
      ]);
      result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);
      expect(result).toBe(query);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(DocumentMetadata.find().lean).toHaveBeenCalled();
      expect(relationshipGraphService.traverseGraph).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use fallback documents if no query terms match any document metadata (and enough docs exist)', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'unrelated_file.pdf', topics: ['unrelated_topic'], entities: ['unrelated_entity'], summary: 'summary1' },
        { docId: 'doc2', fileName: 'another_unrelated.pdf', topics: ['another_topic'], entities: ['another_entity'], summary: 'summary2' },
        { docId: 'doc3', fileName: 'yet_another.pdf', topics: ['yet_another'], entities: ['yet_another'], summary: 'summary3' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({ edges: [] }); // No edges for now

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1', 'doc2'], 1);
      expect(result).toBe(query); // Still returns original query if no edges
    });

    it('should identify matching documents based on filename, topics, or entities', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'project_status_report.pdf', topics: ['finance'], entities: ['budget'], summary: 'summary1' },
        { docId: 'doc2', fileName: 'marketing_plan.pdf', topics: ['strategy', 'status'], entities: ['customers'], summary: 'summary2' },
        { docId: 'doc3', fileName: 'hr_policy.pdf', topics: ['employees'], entities: ['status_update'], summary: 'summary3' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({ edges: [] }); // No edges for now

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      // 'project_status_report' matches 'status'
      // 'marketing_plan' matches 'status' in topics
      // 'hr_policy' matches 'status_update' in entities
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1', 'doc2', 'doc3'], 1);
      expect(result).toBe(query); // Still returns original query if no edges
    });

    it('should return the original query if graph traversal yields no connected edges', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'project_status_report.pdf', topics: ['finance', 'status'], entities: ['budget'], summary: 'summary1' },
        { docId: 'doc2', fileName: 'marketing_plan.pdf', topics: ['strategy'], entities: ['customers'], summary: 'summary2' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({ edges: [] });

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1'], 1); // Only doc1 matches 'status'
      expect(result).toBe(query);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should enrich the query with cross-document relationship context if edges are found', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'Project_Status_Report.pdf', topics: ['Finance', 'Status'], entities: ['Budget'], summary: 'Summary of project status.' },
        { docId: 'doc2', fileName: 'Meeting_Minutes_Q1.pdf', topics: ['Meetings', 'Decisions'], entities: ['Team'], summary: 'Key decisions from Q1 meeting.' },
        { docId: 'doc3', fileName: 'Action_Items_Followup.pdf', topics: ['Tasks', 'Followup'], entities: ['Actions'], summary: 'Followup on action items.' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({
        edges: [
          { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'REFERENCES', confidence: 0.85 },
          { sourceDocId: 'doc1', targetDocId: 'doc3', relationType: 'RELATES_TO', confidence: 0.70 },
          { sourceDocId: 'doc2', targetDocId: 'doc3', relationType: 'FOLLOWS_UP_ON', confidence: 0.92 }, // This edge's targetDocId is already visited
        ],
      });

      const expectedEnrichedQueryStart = `[Graph RAG Cross-Document Knowledge Map]:
You have access to interconnected document contexts. When answering, resolve relationships between these related items:
- Related File: "Meeting_Minutes_Q1.pdf" (REFERENCES link, confidence: 0.85). Topics: Meetings, Decisions. Context Summary: Key decisions from Q1 meeting.
- Related File: "Action_Items_Followup.pdf" (RELATES_TO link, confidence: 0.70). Topics: Tasks, Followup. Context Summary: Followup on action items.

User Query:
${query}`;

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1'], 1); // Only doc1 matches 'status'
      expect(result).toContain(expectedEnrichedQueryStart);
      expect(logger.info).toHaveBeenCalledWith('GraphRetriever: enriched query with 2 relational document links');
    });

    it('should handle cases where targetMeta is not found for an edge', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'Project_Status_Report.pdf', topics: ['Finance', 'Status'], entities: ['Budget'], summary: 'Summary of project status.' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({
        edges: [
          { sourceDocId: 'doc1', targetDocId: 'doc_nonexistent', relationType: 'REFERENCES', confidence: 0.85 },
        ],
      });

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(DocumentMetadata.find).toHaveBeenCalledWith({ userId });
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1'], 1);
      expect(result).toBe(query); // No enrichment because targetMeta not found
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and return the original query', async () => {
      const errorMessage = 'Database error';
      DocumentMetadata.find().lean.mockRejectedValue(new Error(errorMessage));

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(result).toBe(query);
      expect(logger.error).toHaveBeenCalledWith('GraphRetriever context resolution failed:', expect.any(Error));
      expect(logger.error.mock.calls[0][1].message).toBe(errorMessage);
      expect(logger.info).not.toHaveBeenCalled();
      expect(relationshipGraphService.traverseGraph).not.toHaveBeenCalled();
    });

    it('should handle query terms with different casing and partial matches', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'Project_STATUS_Report.pdf', topics: ['finance'], entities: ['budget'], summary: 'summary1' },
        { docId: 'doc2', fileName: 'marketing_plan.pdf', topics: ['STRATEGY', 'Status'], entities: ['customers'], summary: 'summary2' },
        { docId: 'doc3', fileName: 'hr_policy.pdf', topics: ['employees'], entities: ['Status_Update'], summary: 'summary3' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({ edges: [] });

      const queryMixedCase = 'What is the ProJect status?';
      const result = await graphRetrieverService.getGraphEnrichedQueryContext(queryMixedCase, userId);

      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1', 'doc2', 'doc3'], 1);
      expect(result).toBe(queryMixedCase);
    });

    it('should handle file names with multiple parts and underscores', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'project_status_report_2023_Q4.pdf', topics: [], entities: [], summary: 'summary1' },
        { docId: 'doc2', fileName: 'annual_budget_review.docx', topics: [], entities: [], summary: 'summary2' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({ edges: [] });

      const queryFileName = 'report 2023';
      const result = await graphRetrieverService.getGraphEnrichedQueryContext(queryFileName, userId);

      // 'report' and '2023' should match parts of 'project_status_report_2023_Q4.pdf'
      expect(relationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1'], 1);
      expect(result).toBe(queryFileName);
    });

    it('should deduplicate targetDocIds in the enriched context', async () => {
      const metadata = [
        { docId: 'doc1', fileName: 'Project_Status_Report.pdf', topics: ['Finance', 'Status'], entities: ['Budget'], summary: 'Summary of project status.' },
        { docId: 'doc2', fileName: 'Meeting_Minutes_Q1.pdf', topics: ['Meetings', 'Decisions'], entities: ['Team'], summary: 'Key decisions from Q1 meeting.' },
      ];
      mockDocumentMetadata(metadata);
      mockTraverseGraph({
        edges: [
          { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'REFERENCES', confidence: 0.85 },
          { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'MENTIONS', confidence: 0.60 }, // Duplicate targetDocId
        ],
      });

      const expectedEnrichedQueryStart = `[Graph RAG Cross-Document Knowledge Map]:
You have access to interconnected document contexts. When answering, resolve relationships between these related items:
- Related File: "Meeting_Minutes_Q1.pdf" (REFERENCES link, confidence: 0.85). Topics: Meetings, Decisions. Context Summary: Key decisions from Q1 meeting.

User Query:
${query}`;

      const result = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      expect(result).toContain(expectedEnrichedQueryStart);
      expect(logger.info).toHaveBeenCalledWith('GraphRetriever: enriched query with 1 relational document links');
    });
  });
});