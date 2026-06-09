import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextPrunerService } from './llamaindex.contextPruner.js'; // Assuming this is the file under test

// Mock dependencies
const mockDocumentMetadata = {
  find: vi.fn(),
};

const mockRelationshipGraphService = {
  traverseGraph: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock('./llamaindex.metadata.model.js', () => ({
  default: mockDocumentMetadata,
}));

vi.mock('./llamaindex.relationshipGraph.js', () => ({
  relationshipGraphService: mockRelationshipGraphService,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Helper functions from the module, not exported but used internally
// We can import them directly for testing if they are not part of the public API,
// or test them indirectly through the main function.
// For this case, getTokens and computeJaccardSimilarity are internal helpers
// and will be tested implicitly via pruneAndRerank, but it's good practice
// to test them explicitly if they have complex logic.
// Let's extract them for explicit testing.
const getTokens = (text) => {
  const STOPWORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
    'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
    'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
    'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
    'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that',
    'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd',
    'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
    'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres',
    'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd',
    'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
  ]);
  if (!text) return new Set();
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s_]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
  return new Set(words);
};

const computeJaccardSimilarity = (setA, setB) => {
  if (setA.size === 0 || setB.size === 0) return 0;
  
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }
  
  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
};


describe('getTokens', () => {
  it('should return an empty set for an empty string', () => {
    expect(getTokens('')).toEqual(new Set());
  });

  it('should return an empty set for a string with only stopwords', () => {
    expect(getTokens('a the and is')).toEqual(new Set());
  });

  it('should tokenize and filter stopwords and short words', () => {
    const text = 'This is a test document with some important keywords and numbers 123.';
    expect(getTokens(text)).toEqual(new Set(['test', 'document', 'important', 'keywords', 'numbers', '123']));
  });

  it('should handle punctuation and special characters', () => {
    const text = 'Hello, world! This-is_a.test?';
    expect(getTokens(text)).toEqual(new Set(['hello', 'world', 'this_is_a', 'test']));
  });

  it('should convert to lowercase', () => {
    const text = 'HELLO World';
    expect(getTokens(text)).toEqual(new Set(['hello', 'world']));
  });
});

describe('computeJaccardSimilarity', () => {
  it('should return 0 for two empty sets', () => {
    expect(computeJaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('should return 0 if one set is empty', () => {
    expect(computeJaccardSimilarity(new Set(['a', 'b']), new Set())).toBe(0);
    expect(computeJaccardSimilarity(new Set(), new Set(['a', 'b']))).toBe(0);
  });

  it('should return 1 for two identical sets', () => {
    const setA = new Set(['apple', 'banana', 'orange']);
    const setB = new Set(['apple', 'banana', 'orange']);
    expect(computeJaccardSimilarity(setA, setB)).toBe(1);
  });

  it('should return 0 for two completely different sets', () => {
    const setA = new Set(['apple', 'banana']);
    const setB = new Set(['grape', 'kiwi']);
    expect(computeJaccardSimilarity(setA, setB)).toBe(0);
  });

  it('should compute similarity correctly for overlapping sets', () => {
    const setA = new Set(['apple', 'banana', 'orange']);
    const setB = new Set(['banana', 'orange', 'grape']);
    // Intersection: {'banana', 'orange'} (size 2)
    // Union: {'apple', 'banana', 'orange', 'grape'} (size 4)
    // Jaccard: 2/4 = 0.5
    expect(computeJaccardSimilarity(setA, setB)).toBe(0.5);
  });

  it('should handle sets with different sizes', () => {
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['a', 'b', 'd', 'e']);
    // Intersection: {'a', 'b'} (size 2)
    // Union: {'a', 'b', 'c', 'd', 'e'} (size 5)
    // Jaccard: 2/5 = 0.4
    expect(computeJaccardSimilarity(setA, setB)).toBe(0.4);
  });
});

describe('contextPrunerService.pruneAndRerank', () => {
  const userId = 'user123';
  const query = 'What is the project status for the new feature?';

  const mockMetadata = [
    { docId: 'doc1', userId, fileName: 'Project_Status_Report.pdf', topics: ['project management', 'status'], entities: ['new feature'], summary: 'Summary of project status and progress on new feature.' },
    { docId: 'doc2', userId, fileName: 'Feature_Design_Doc.docx', topics: ['design', 'feature'], entities: ['new feature', 'UI'], summary: 'Detailed design for the new feature, including UI/UX.' },
    { docId: 'doc3', userId, fileName: 'Meeting_Notes_Q1.txt', topics: ['meetings', 'quarterly'], entities: ['budget'], summary: 'General meeting notes for Q1, discussing budget and old projects.' },
    { docId: 'doc4', userId, fileName: 'Technical_Spec.pdf', topics: ['technical', 'implementation'], entities: ['backend', 'API'], summary: 'Technical specifications for backend API.' },
    { docId: 'doc5', userId, fileName: 'Another_Relevant_Doc.pdf', topics: ['project management', 'status'], entities: ['new feature'], summary: 'Another document about project status and new feature.' },
    { docId: 'doc6', userId, fileName: 'Less_Relevant_Doc.pdf', topics: ['unrelated'], entities: ['nothing'], summary: 'This document is not relevant.' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the original query if no document metadata is found', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce([]);
    const result = await contextPrunerService.pruneAndRerank(query, userId);
    expect(result).toBe(query);
    expect(mockDocumentMetadata.find).toHaveBeenCalledWith({ userId });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should return the original query if less than 2 document metadata entries are found', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce([mockMetadata[0]]);
    const result = await contextPrunerService.pruneAndRerank(query, userId);
    expect(result).toBe(query);
    expect(mockDocumentMetadata.find).toHaveBeenCalledWith({ userId });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should return the original query if no relational links are found', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({ edges: [] });

    const result = await contextPrunerService.pruneAndRerank(query, userId);
    expect(result).toBe(query);
    expect(mockDocumentMetadata.find).toHaveBeenCalledWith({ userId });
    expect(mockRelationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, expect.any(Array), 1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should return the original query if all connected edges are pruned due to low relevance', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc3', relationType: 'mentions', confidence: 0.1 }, // Low Jaccard, low confidence -> low relevance
        { sourceDocId: 'doc1', targetDocId: 'doc6', relationType: 'references', confidence: 0.2 }, // Low Jaccard, low confidence -> low relevance
      ]
    });

    const result = await contextPrunerService.pruneAndRerank(query, userId);
    expect(result).toBe(query);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Graph RAG Coherence: "Meeting_Notes_Q1.txt" computed relevanceScore: 0.060'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Graph RAG Coherence: "Less_Relevant_Doc.pdf" computed relevanceScore: 0.060'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ContextPruner: injected 0 coherent & reranked document context links, pruned 2 connections.'));
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should enrich the query with relevant, reranked document contexts', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'details', confidence: 0.9 }, // High relevance
        { sourceDocId: 'doc1', targetDocId: 'doc5', relationType: 'related', confidence: 0.8 }, // High relevance
        { sourceDocId: 'doc1', targetDocId: 'doc4', relationType: 'technical', confidence: 0.6 }, // Medium relevance (Jaccard will be lower)
        { sourceDocId: 'doc1', targetDocId: 'doc3', relationType: 'mentions', confidence: 0.1 }, // Low relevance, should be pruned
      ]
    });

    const result = await contextPrunerService.pruneAndRerank(query, userId);

    expect(mockDocumentMetadata.find).toHaveBeenCalledWith({ userId });
    expect(mockRelationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1', 'doc2'], 1); // doc1 and doc2 match 'project status' and 'new feature'

    expect(result).toContain('[Graph RAG Cross-Document Knowledge Map]:');
    expect(result).toContain('User Query:\nWhat is the project status for the new feature?');

    // Check for specific documents and their order (reranking)
    // doc2: "Feature_Design_Doc.docx" - high Jaccard with "new feature", high confidence
    // doc5: "Another_Relevant_Doc.pdf" - high Jaccard with "project status", high confidence
    // doc4: "Technical_Spec.pdf" - lower Jaccard, medium confidence
    // doc3: "Meeting_Notes_Q1.txt" - very low Jaccard, low confidence -> pruned

    // Expected Jaccard scores (approximate, based on tokens):
    // Query: {project, status, new, feature}
    // Doc2: {feature, design, docx, new, feature, ui, detailed, design, new, feature, including, ui/ux} -> {feature, design, docx, new, ui, detailed, including, ui/ux}
    // Intersection: {new, feature} (2)
    // Union: {project, status, new, feature, design, docx, ui, detailed, including, ui/ux} (10)
    // Jaccard for Doc2: 2/10 = 0.2
    // Relevance for Doc2: (0.2 * 0.7) + (0.9 * 0.3) = 0.14 + 0.27 = 0.41

    // Doc5: {another, relevant, doc, project, management, status, new, feature, another, document, about, project, status, new, feature} -> {another, relevant, doc, project, management, status, new, feature, document}
    // Intersection: {project, status, new, feature} (4)
    // Union: {project, status, new, feature, another, relevant, doc, management, document} (9)
    // Jaccard for Doc5: 4/9 = 0.444
    // Relevance for Doc5: (0.444 * 0.7) + (0.8 * 0.3) = 0.3108 + 0.24 = 0.5508

    // Doc4: {technical, spec, pdf, technical, implementation, backend, api, technical, specifications, backend, api} -> {technical, spec, pdf, implementation, backend, api, specifications}
    // Intersection: {} (0)
    // Union: {project, status, new, feature, technical, spec, pdf, implementation, backend, api, specifications} (11)
    // Jaccard for Doc4: 0/11 = 0
    // Relevance for Doc4: (0 * 0.7) + (0.6 * 0.3) = 0 + 0.18 = 0.18 (This should be pruned as < 0.25)

    // Let's adjust mock data or expectations for Doc4 to pass the threshold.
    // Or, ensure the test correctly asserts pruning.
    // If Doc4 is pruned, we should only see Doc2 and Doc5.

    // Re-evaluating Doc4: Query has "status", Doc4 has "technical", "implementation". No direct overlap.
    // So Jaccard will be 0. Relevance will be 0.18. It should be pruned.

    // Let's make Doc4 slightly more relevant for a 3rd item in the list.
    const mockMetadataWithMoreRelevantDoc4 = [
      ...mockMetadata.slice(0, 3),
      { docId: 'doc4', userId, fileName: 'Technical_Project_Status.pdf', topics: ['technical', 'project management', 'status'], entities: ['backend', 'API', 'new feature'], summary: 'Technical specifications for backend API, including project status for new feature.' },
      ...mockMetadata.slice(4),
    ];

    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadataWithMoreRelevantDoc4);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'details', confidence: 0.9 }, // High relevance
        { sourceDocId: 'doc1', targetDocId: 'doc5', relationType: 'related', confidence: 0.8 }, // High relevance
        { sourceDocId: 'doc1', targetDocId: 'doc4', relationType: 'technical', confidence: 0.6 }, // Now higher relevance
        { sourceDocId: 'doc1', targetDocId: 'doc3', relationType: 'mentions', confidence: 0.1 }, // Low relevance, should be pruned
      ]
    });

    const result2 = await contextPrunerService.pruneAndRerank(query, userId);

    // New Jaccard for Doc4 (with updated summary/topics):
    // Query: {project, status, new, feature}
    // Doc4 text: "Technical_Project_Status.pdf technical project management status backend API new feature Technical specifications for backend API, including project status for new feature."
    // Tokens: {technical, project, status, backend, api, new, feature, specifications, including, management}
    // Intersection: {project, status, new, feature} (4)
    // Union: {project, status, new, feature, technical, backend, api, specifications, including, management} (10)
    // Jaccard for Doc4: 4/10 = 0.4
    // Relevance for Doc4: (0.4 * 0.7) + (0.6 * 0.3) = 0.28 + 0.18 = 0.46

    // Expected order of relevance: Doc5 (0.5508), Doc2 (0.41), Doc4 (0.46)
    // Wait, Doc4 (0.46) should be between Doc5 and Doc2.
    // Corrected order: Doc5, Doc4, Doc2

    expect(result2).toContain(`- Related File: "Another_Relevant_Doc.pdf" (related link, coherence: 0.551, confidence: 0.8). Topics: project management, status. Context Summary: Another document about project status and new feature.`);
    expect(result2).toContain(`- Related File: "Technical_Project_Status.pdf" (technical link, coherence: 0.460, confidence: 0.6). Topics: technical, project management, status. Context Summary: Technical specifications for backend API, including project status for new feature.`);
    expect(result2).toContain(`- Related File: "Feature_Design_Doc.docx" (details link, coherence: 0.410, confidence: 0.9). Topics: design, feature. Context Summary: Detailed design for the new feature, including UI/UX.`);
    expect(result2).not.toContain('Meeting_Notes_Q1.txt'); // Should be pruned

    const lines = result2.split('\n').filter(line => line.startsWith('- Related File:'));
    expect(lines.length).toBe(3); // Only 3 relevant links
    expect(lines[0]).toContain('Another_Relevant_Doc.pdf');
    expect(lines[1]).toContain('Technical_Project_Status.pdf');
    expect(lines[2]).toContain('Feature_Design_Doc.docx');

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ContextPruner: injected 3 coherent & reranked document context links, pruned 1 connections.'));
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should handle the fallback to top 2 files if no exact keyword match', async () => {
    const obscureQuery = 'unrelated query about cats';
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'details', confidence: 0.9 },
      ]
    });

    await contextPrunerService.pruneAndRerank(obscureQuery, userId);
    // The initial matchingDocIds will be ['doc1', 'doc2'] because of the fallback
    expect(mockRelationshipGraphService.traverseGraph).toHaveBeenCalledWith(userId, ['doc1', 'doc2'], 1);
  });

  it('should limit context expansion to top 5 highly coherent nodes', async () => {
    const mockMetadataMany = Array.from({ length: 10 }, (_, i) => ({
      docId: `doc${i + 1}`,
      userId,
      fileName: `File_${i + 1}_Project_Status.pdf`,
      topics: ['project management', 'status'],
      entities: ['new feature'],
      summary: `Summary for file ${i + 1} about project status and new feature.`,
    }));

    const mockEdgesMany = Array.from({ length: 10 }, (_, i) => ({
      sourceDocId: 'doc1',
      targetDocId: `doc${i + 1}`,
      relationType: 'related',
      confidence: 0.9 - (i * 0.05), // Decreasing confidence for sorting
    }));

    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadataMany);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({ edges: mockEdgesMany });

    const result = await contextPrunerService.pruneAndRerank(query, userId);

    const lines = result.split('\n').filter(line => line.startsWith('- Related File:'));
    expect(lines.length).toBe(5); // Should be limited to 5
    expect(lines[0]).toContain('File_1_Project_Status.pdf');
    expect(lines[1]).toContain('File_2_Project_Status.pdf');
    expect(lines[2]).toContain('File_3_Project_Status.pdf');
    expect(lines[3]).toContain('File_4_Project_Status.pdf');
    expect(lines[4]).toContain('File_5_Project_Status.pdf');
    expect(result).not.toContain('File_6_Project_Status.pdf');
  });

  it('should handle errors gracefully and return the original query', async () => {
    const errorMessage = 'Database connection failed';
    mockDocumentMetadata.find.mockRejectedValueOnce(new Error(errorMessage));

    const result = await contextPrunerService.pruneAndRerank(query, userId);
    expect(result).toBe(query);
    expect(mockLogger.error).toHaveBeenCalledWith('ContextPruner pruneAndRerank failed:', expect.any(Error));
    expect(mockLogger.error.mock.calls[0][1].message).toBe(errorMessage);
  });

  it('should use default confidence of 0.5 if edge.confidence is undefined', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'details' }, // confidence is undefined
      ]
    });

    const result = await contextPrunerService.pruneAndRerank(query, userId);

    // Query: {project, status, new, feature}
    // Doc2: {feature, design, docx, new, feature, ui, detailed, design, new, feature, including, ui/ux} -> {feature, design, docx, new, ui, detailed, including, ui/ux}
    // Intersection: {new, feature} (2)
    // Union: {project, status, new, feature, design, docx, ui, detailed, including, ui/ux} (10)
    // Jaccard for Doc2: 2/10 = 0.2
    // Relevance for Doc2: (0.2 * 0.7) + (0.5 * 0.3) = 0.14 + 0.15 = 0.29 (should pass threshold)

    expect(result).toContain(`- Related File: "Feature_Design_Doc.docx" (details link, coherence: 0.290, confidence: 0.5). Topics: design, feature. Context Summary: Detailed design for the new feature, including UI/UX.`);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Graph RAG Coherence: "Feature_Design_Doc.docx" computed relevanceScore: 0.290 (Jaccard: 0.200, Link Confidence: 0.500)'));
  });

  it('should not add duplicate targetDocIds to scoredLinks', async () => {
    mockDocumentMetadata.find.mockResolvedValueOnce(mockMetadata);
    mockRelationshipGraphService.traverseGraph.mockResolvedValueOnce({
      edges: [
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'details', confidence: 0.9 },
        { sourceDocId: 'doc1', targetDocId: 'doc2', relationType: 'another_link', confidence: 0.8 }, // Duplicate targetDocId
      ]
    });

    const result = await contextPrunerService.pruneAndRerank(query, userId);
    const lines = result.split('\n').filter(line => line.startsWith('- Related File:'));
    expect(lines.length).toBe(1); // Only one entry for doc2
    expect(lines[0]).toContain('Feature_Design_Doc.docx');
  });
});