import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import DocumentRelationship from './llamaindex.relationship.model.js';
// INTEGRATION: Import a hypothetical usage service to track resource consumption.
// This is crucial for propagating usage details to workspace admins and platform owners.
// import { usageService } from '../../usage/usage.service.js';

/**
 * Initializes the Google Generative AI client with the API key from the configuration.
 * This instance is used for deep semantic analysis and relationship extraction.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Calculates the Jaccard similarity coefficient between two arrays of strings.
 * The comparison is case-insensitive.
 *
 * The Jaccard coefficient is a statistic used for gauging the similarity and diversity of sample sets.
 * It is defined as the size of the intersection divided by the size of the union of the sample sets.
 *
 * @param {string[]} arr1 - The first array of strings (e.g., topics, entities).
 * @param {string[]} arr2 - The second array of strings (e.g., topics, entities).
 * @returns {number} The Jaccard similarity coefficient, a value between 0 and 1.
 *                    Returns 0 if the union of the sets is empty.
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
 * Re-builds the relational semantic map between all documents within a workspace.
 * This process involves two main steps:
 * 1.  **Intersection Analysis Matrix**: Calculates Jaccard similarity for topics and entities
 *     between all document pairs. If a significant overlap (coefficient > 0.1) is found,
 *     a `topic_similarity` relationship edge is created or updated bidirectionally.
 * 2.  **Google Gemini Deep Semantic Cross-reference Modeling**: For a subset of top comparison
 *     candidates, it leverages the Google Gemini AI model to detect more complex logical
 *     dependencies, prerequisite links, or hierarchical cross-references.
 *
 * Relationship edges are stored in the `DocumentRelationship` collection.
 * This is a workspace-level operation and should be triggered by a system process or a user with
 * administrative privileges over the workspace (e.g., Workspace Admin).
 *
 * @param {string} workspaceId - The ID of the workspace for which to build the relationship graph. This ensures tenant data isolation.
 * @returns {Promise<object>} An object indicating the success status, a descriptive message,
 *                            and the total number of relationship edges added or updated.
 * @throws {Error} If the relationship graph compilation fails due to a database error or other issues.
 */
// BUGFIX: The function now operates on a workspaceId instead of a userId to enforce tenant boundaries.
// This is critical for a multi-tenant system with roles like admin, manager, and user.
// All data operations are now scoped to the workspace, preventing data leakage or
// incorrect graph generation across different tenants.
const buildRelationshipGraph = async (workspaceId) => {
  try {
    // INTEGRATION: Logging now references workspaceId for better traceability in a multi-tenant environment.
    logger.info(`RelationshipGraph: compiling semantic document networks for workspace ${workspaceId}`);

    // BUGFIX: Fetched metadata is scoped by workspaceId, not userId. This ensures the graph
    // considers all relevant documents within the tenant's context, not just one user's.
    // PERFORMANCE: Ensure an index exists on `workspaceId` in the `DocumentMetadata` collection
    // to optimize this initial fetch of all documents for a tenant.
    // Example: db.documentmetadatas.createIndex({ workspaceId: 1 })
    const metadataList = await DocumentMetadata.find({ workspaceId }).lean();
    if (metadataList.length < 2) {
      return {
        success: true,
        message: 'At least 2 enriched documents are required to map relationships.',
        edgesCount: 0,
      };
    }

    let edgesAdded = 0;
    const comparisons = [];
    const relationshipUpdatePromises = []; // Collect promises for parallel execution

    // Step 1: Intersection analysis matrix
    // PERFORMANCE_NOTE: This O(N^2) loop can be CPU-intensive for workspaces with a large
    // number of documents (N > 1000). For enterprise-scale tenants, consider moving this
    // entire function into a separate worker thread or a background job queue (e.g., BullMQ, RabbitMQ)
    // to avoid blocking the main Node.js event loop.
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
          // Collect promises to execute updates in parallel for performance
          // PERFORMANCE: Ensure a compound index exists on `{ workspaceId, sourceDocId, targetDocId }`
          // in the `DocumentRelationship` collection to make these frequent upsert operations highly efficient.
          // Example: db.documentrelationships.createIndex({ workspaceId: 1, sourceDocId: 1, targetDocId: 1 })
          relationshipUpdatePromises.push(
            DocumentRelationship.findOneAndUpdate(
              // BUGFIX: Query is scoped by workspaceId to ensure relationship edges are created
              // within the correct tenant boundary. The userId is removed to reflect workspace-level relationships.
              { workspaceId, sourceDocId: docA.docId, targetDocId: docB.docId },
              {
                relationType: 'topic_similarity',
                confidence: Math.round(overlapCoefficient * 100) / 100,
                sharedConcepts: shared,
                description: `Shared topics and key entity alignments: ${shared.slice(0, 4).join(', ')}`,
              },
              { new: true, upsert: true }
            )
          );

          relationshipUpdatePromises.push(
            DocumentRelationship.findOneAndUpdate(
              // BUGFIX: Query is scoped by workspaceId to ensure relationship edges are created
              // within the correct tenant boundary.
              { workspaceId, sourceDocId: docB.docId, targetDocId: docA.docId },
              {
                relationType: 'topic_similarity',
                confidence: Math.round(overlapCoefficient * 100) / 100,
                sharedConcepts: shared,
                description: `Shared topics and key entity alignments: ${shared.slice(0, 4).join(', ')}`,
              },
              { new: true, upsert: true }
            )
          );

          edgesAdded += 2;
        }

        comparisons.push({ docA, docB });
      }
    }

    // Await all collected promises for topic_similarity relationships
    await Promise.all(relationshipUpdatePromises);

    // Step 2: Google Gemini Deep Semantic cross-reference modeling
    // Process top comparison candidates to discover logical prerequisites or hierarchies
    const topCandidates = comparisons.slice(0, 10); // Limit to top 10 for AI processing
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
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Using a more recent model
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: linkagePrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        // INTEGRATION: Track AI model usage against the workspace account.
        // This is a critical point for propagating usage details up to administrators
        // for billing, limit enforcement, and monitoring.
        // Example: await usageService.trackGeminiUsage(workspaceId, result.usageMetadata);

        let cleanText = result.response.text().trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
        }

        const linkages = JSON.parse(cleanText);
        const geminiUpdatePromises = []; // Collect promises for parallel execution of Gemini-derived updates
        for (const link of linkages) {
          const ids = link.pair.split(' <-> ');
          if (ids.length === 2) {
            const [src, dst] = ids;

            geminiUpdatePromises.push(
              DocumentRelationship.findOneAndUpdate(
                // BUGFIX: Query is scoped by workspaceId.
                { workspaceId, sourceDocId: src, targetDocId: dst },
                {
                  relationType: link.relationType === 'dependency' ? 'dependency' : 'cross_reference',
                  confidence: link.confidence || 0.7,
                  description: link.description || 'Deep semantic reference mapped by cognitive agent.',
                },
                { new: true, upsert: true }
              )
            );
            edgesAdded++;
          }
        }
        // Await all collected promises for Gemini-derived relationships
        await Promise.all(geminiUpdatePromises);
      } catch (geminiErr) {
        logger.warn(`RelationshipGraph: Gemini linkage extraction bypassed for workspace ${workspaceId}:`, geminiErr.message);
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
 * Traverses the relationship graph from a set of starting document IDs up to a specified depth.
 * This function performs a Breadth-First Search (BFS) like traversal to discover connected documents
 * and their relationships within a specific workspace.
 *
 * @permission This function is multi-tenant and requires a valid `workspaceId`. Any user belonging to the workspace
 *             can perform a traversal, as it respects the data boundaries of the tenant.
 * @param {string} workspaceId - The ID of the workspace whose graph is to be traversed.
 * @param {string[]} startDocIds - An array of document IDs from which to start the traversal.
 * @param {number} [depth=1] - The maximum depth of traversal. A depth of 1 means only direct connections.
 * @returns {Promise<object>} An object containing:
 *   - `success`: A boolean indicating if the traversal was successful.
 *   - `startingNodes`: The array of document IDs from which the traversal began.
 *   - `traversedNodes`: An array of all unique document IDs visited during the traversal.
 *   - `edges`: An array of all `DocumentRelationship` objects (edges) discovered during the traversal.
 * @throws {Error} If the graph traversal fails.
 */
// BUGFIX: Changed userId to workspaceId to ensure traversal is strictly confined to the calling user's tenant.
const traverseGraph = async (workspaceId, startDocIds, depth = 1) => {
  try {
    const visited = new Set(startDocIds);
    let currentFrontier = [...startDocIds]; // Nodes to explore at the current depth
    const allEdges = [];

    for (let i = 0; i < depth; i++) {
      if (currentFrontier.length === 0) break; // Stop if there are no more nodes to explore

      // PERFORMANCE: Solves N+1 query problem. Instead of one query per node,
      // this performs one query per traversal depth level using the $in operator.
      // This requires an index on { workspaceId: 1, sourceDocId: 1 } for efficiency.
      const edges = await DocumentRelationship.find({
        workspaceId,
        sourceDocId: { $in: currentFrontier },
      }).lean();

      const nextFrontier = new Set();
      for (const edge of edges) {
        allEdges.push(edge);
        if (!visited.has(edge.targetDocId)) {
          visited.add(edge.targetDocId);
          nextFrontier.add(edge.targetDocId);
        }
      }
      currentFrontier = Array.from(nextFrontier);
    }

    return {
      success: true,
      startingNodes: startDocIds,
      traversedNodes: Array.from(visited),
      edges: allEdges,
    };
  } catch (err) {
    logger.error('RelationshipGraph traverse failed:', err);
    throw err;
  }
};

/**
 * @namespace relationshipGraphService
 * @description Provides services for managing and querying the semantic relationship graph
 *              between documents within a workspace. This includes building the graph based on document
 *              metadata and deep semantic analysis, and traversing it to find related documents.
 *              All operations are scoped to a specific workspace to ensure multi-tenancy.
 */
export const relationshipGraphService = {
  /**
   * Re-builds the relational semantic map between all documents within a workspace.
   * @function buildRelationshipGraph
   * @memberof relationshipGraphService
   * @see {@link buildRelationshipGraph}
   */
  buildRelationshipGraph,
  /**
   * Traverses the relationship graph from a set of starting document IDs up to a specified depth.
   * @function traverseGraph
   * @memberof relationshipGraphService
   * @see {@link traverseGraph}
   */
  traverseGraph,
};