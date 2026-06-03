import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import DocumentRelationship from './llamaindex.relationship.model.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Calculates Jaccard intersection coefficient between two arrays.
 */
const calculateJaccard = (arr1, arr2) => {
  const s1 = new Set(arr1.map(v => v.toLowerCase()));
  const s2 = new Set(arr2.map(v => v.toLowerCase()));

  const intersection = new Set([...s1].filter(x => s2.has(x)));
  const union = new Set([...s1, ...s2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
};

/**
 * Re-builds the relational semantic map between all user documents.
 */
const buildRelationshipGraph = async (userId) => {
  try {
    logger.info(`RelationshipGraph: compiling semantic document networks for user ${userId}`);

    const metadataList = await DocumentMetadata.find({ userId }).lean();
    if (metadataList.length < 2) {
      return {
        success: true,
        message: 'At least 2 enriched documents are required to map relationships.',
        edgesCount: 0,
      };
    }

    let edgesAdded = 0;
    const comparisons = [];

    // Step 1: Intersection analysis matrix
    for (let i = 0; i < metadataList.length; i++) {
      for (let j = i + 1; j < metadataList.length; j++) {
        const docA = metadataList[i];
        const docB = metadataList[j];

        // Match shared topics & entities
        const topicSim = calculateJaccard(docA.topics, docB.topics);
        const entitySim = calculateJaccard(docA.entities, docB.entities);
        const overlapCoefficient = (topicSim * 0.6) + (entitySim * 0.4);

        if (overlapCoefficient > 0.1) {
          const shared = [...new Set([
            ...docA.topics.filter(x => docB.topics.some(y => y.toLowerCase() === x.toLowerCase())),
            ...docA.entities.filter(x => docB.entities.some(y => y.toLowerCase() === x.toLowerCase()))
          ])];

          // Create standard bidirectional overlap edges
          await DocumentRelationship.findOneAndUpdate(
            { userId, sourceDocId: docA.docId, targetDocId: docB.docId },
            {
              relationType: 'topic_similarity',
              confidence: Math.round(overlapCoefficient * 100) / 100,
              sharedConcepts: shared,
              description: `Shared topics and key entity alignments: ${shared.slice(0, 4).join(', ')}`,
            },
            { new: true, upsert: true }
          );

          await DocumentRelationship.findOneAndUpdate(
            { userId, sourceDocId: docB.docId, targetDocId: docA.docId },
            {
              relationType: 'topic_similarity',
              confidence: Math.round(overlapCoefficient * 100) / 100,
              sharedConcepts: shared,
              description: `Shared topics and key entity alignments: ${shared.slice(0, 4).join(', ')}`,
            },
            { new: true, upsert: true }
          );

          edgesAdded += 2;
        }

        comparisons.push({ docA, docB });
      }
    }

    // Step 2: Google Gemini Deep Semantic cross-reference modeling
    // Process top comparison candidates to discover logical prerequisites or hierarchies
    const topCandidates = comparisons.slice(0, 10);
    if (topCandidates.length > 0) {
      const summaryPayload = topCandidates.map(c => ({
        pair: `${c.docA.docId} <-> ${c.docB.docId}`,
        docA: { title: c.docA.fileName, summary: c.docA.summary, topics: c.docA.topics },
        docB: { title: c.docB.fileName, summary: c.docB.summary, topics: c.docB.topics }
      }));

      const linkagePrompt = `You are a high-level cognitive knowledge graph generator. Analyze these document pairs and detect logical dependencies, prerequisite links, or direct hierarchical cross-references (e.g. Document A is a sub-page, policy sheet, or prerequisite study of Document B).
Pairs Payload:
${JSON.stringify(summaryPayload, null, 2)}

Return your output as a clean, structured JSON array following this exact schema:
[
  {
    "pair": "sourceDocId <-> targetDocId",
    "relationType": "dependency" | "hierarchical" | "cross_reference",
    "confidence": 0.85,
    "description": "Prerequisite connection reasoning: Doc A contains prerequisite instructions required for Doc B."
  }
]

Ensure your response is raw JSON only, with no markdown block ticks.`;

      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: linkagePrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        let cleanText = result.response.text().trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
        }

        const linkages = JSON.parse(cleanText);
        for (const link of linkages) {
          const ids = link.pair.split(' <-> ');
          if (ids.length === 2) {
            const [src, dst] = ids;

            await DocumentRelationship.findOneAndUpdate(
              { userId, sourceDocId: src, targetDocId: dst },
              {
                relationType: link.relationType === 'dependency' ? 'dependency' : 'cross_reference',
                confidence: link.confidence || 0.7,
                description: link.description || 'Deep semantic reference mapped by cognitive agent.',
              },
              { new: true, upsert: true }
            );
            edgesAdded++;
          }
        }
      } catch (geminiErr) {
        logger.warn('RelationshipGraph: Gemini linkage extraction bypassed:', geminiErr.message);
      }
    }

    return {
      success: true,
      message: `Relational mapping complete. Created ${edgesAdded} relationship edge(s) across ${metadataList.length} documents.`,
      edgesCount: edgesAdded,
    };
  } catch (err) {
    logger.error('RelationshipGraph error:', err);
    throw new Error(`Failed to compile relationship graph: ${err.message}`);
  }
};

/**
 * Traverses the relationship graph from a set of starting document IDs.
 */
const traverseGraph = async (userId, startDocIds, depth = 1) => {
  try {
    const visited = new Set(startDocIds);
    const queue = startDocIds.map(id => ({ id, currentDepth: 0 }));
    const resultEdges = [];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift();
      if (currentDepth >= depth) continue;

      const edges = await DocumentRelationship.find({ userId, sourceDocId: id }).lean();
      for (const edge of edges) {
        resultEdges.push(edge);
        if (!visited.has(edge.targetDocId)) {
          visited.add(edge.targetDocId);
          queue.push({ id: edge.targetDocId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return {
      success: true,
      startingNodes: startDocIds,
      traversedNodes: Array.from(visited),
      edges: resultEdges,
    };
  } catch (err) {
    logger.error('RelationshipGraph traverse failed:', err);
    throw err;
  }
};

export const relationshipGraphService = {
  buildRelationshipGraph,
  traverseGraph,
};
