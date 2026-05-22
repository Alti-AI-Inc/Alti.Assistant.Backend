import { logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Enables Hybrid Search (Dense + Sparse using Reciprocal Rank Fusion) on a RAGSystem instance.
 * @param {RAGSystem} rag - The RAGSystem instance to enhance.
 */
export function enableHybridSearch(rag) {
  // We need to wait until the documentStore is initialized (which happens during rag.initialize())
  // So we intercept rag.initialize() to wrap the retrieveDocuments method of documentStore.
  const originalInitialize = rag.initialize;

  rag.initialize = async function (...args) {
    const result = await originalInitialize.apply(this, args);

    if (this.documentStore && !this.documentStore.isHybridEnabled) {
      const originalRetrieve = this.documentStore.retrieveDocuments;
      const pool = this.pool; // The pg connection pool

      this.documentStore.retrieveDocuments = async function (queryText, options = {}) {
        try {
          const k = options.k || options.limit || 10;
          const filter = options.filter || {};
          const scoreThreshold = options.scoreThreshold || options.threshold || 0.1;

          logger.info(`[HybridSearch] Query: "${queryText}", k: ${k}, filter: ${JSON.stringify(filter)}`);

          // 1. Fetch Semantic (Dense) Search Results using the original retrieveDocuments
          let denseResults = [];
          try {
            denseResults = await originalRetrieve.call(this, queryText, options);
          } catch (err) {
            logger.error(`[HybridSearch] Dense search failed: ${err.message}`);
          }

          // 2. Fetch Keyword (Sparse) Search Results using PostgreSQL Full-Text Search
          let sparseResults = [];
          if (pool && queryText && queryText.trim()) {
            try {
              // Convert query to safe tsquery format
              // We replace non-alphanumeric chars to prevent SQL syntax errors in plainto_tsquery
              const safeQuery = queryText.replace(/[^\w\s]/g, ' ').trim();
              
              if (safeQuery) {
                // Build metadata JSONB matching filter
                // pgvector saves metadata as JSONB. We filter using the jsonb containment operator @>
                let queryStr = `
                  SELECT id, content, metadata
                  FROM document_chunks_vector
                  WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
                `;
                
                const queryParams = [safeQuery];
                
                if (Object.keys(filter).length > 0) {
                  queryStr += ` AND metadata @> $2::jsonb`;
                  queryParams.push(JSON.stringify(filter));
                }
                
                queryStr += ` LIMIT $3`;
                queryParams.push(k * 2); // Fetch more for RRF ranking

                const dbResult = await pool.query(queryStr, queryParams);
                
                sparseResults = dbResult.rows.map((row, index) => ({
                  id: row.id || uuidv4(),
                  content: row.content,
                  chunk_index: row.metadata?.chunkIndex || index,
                  metadata: row.metadata || {},
                  title: row.metadata?.title || 'Unknown',
                  file_path: row.metadata?.filePath || '',
                  file_type: row.metadata?.fileType || '',
                  similarity: 0.5, // Default placeholder for sparse results
                }));
                
                logger.info(`[HybridSearch] Sparse keyword search retrieved ${sparseResults.length} records.`);
              }
            } catch (err) {
              logger.error(`[HybridSearch] Sparse search error: ${err.message}`);
            }
          }

          // 3. Apply Reciprocal Rank Fusion (RRF)
          // RRF Constant (usually 60)
          const RRF_K = 60;
          const docMap = new Map();

          // Helper to add documents to RRF pool
          const processRRF = (results, isDense) => {
            results.forEach((doc, index) => {
              const rank = index + 1;
              const docId = doc.id;
              
              if (!docMap.has(docId)) {
                docMap.set(docId, {
                  doc,
                  denseRank: Infinity,
                  sparseRank: Infinity,
                });
              }
              
              const entry = docMap.get(docId);
              if (isDense) {
                entry.denseRank = rank;
              } else {
                entry.sparseRank = rank;
              }
            });
          };

          processRRF(denseResults, true);
          processRRF(sparseResults, false);

          // Calculate RRF Score for each document
          const rrfResults = Array.from(docMap.values()).map(({ doc, denseRank, sparseRank }) => {
            const denseScore = denseRank === Infinity ? 0 : 1 / (RRF_K + denseRank);
            const sparseScore = sparseRank === Infinity ? 0 : 1 / (RRF_K + sparseRank);
            const rrfScore = denseScore + sparseScore;

            return {
              ...doc,
              rrfScore,
              // Keep original similarity if retrieved by dense search, else construct one
              similarity: doc.similarity || 0.5,
            };
          });

          // Sort by RRF score descending
          rrfResults.sort((a, b) => b.rrfScore - a.rrfScore);

          const finalResults = rrfResults.slice(0, k);
          logger.info(`[HybridSearch] Merged and ranked ${rrfResults.length} total distinct docs down to top ${finalResults.length} using RRF.`);
          
          return finalResults;

        } catch (err) {
          logger.error(`[HybridSearch] Hybrid search retriever failed entirely, falling back to original: ${err.message}`);
          return originalRetrieve.call(this, queryText, options);
        }
      };

      this.documentStore.isHybridEnabled = true;
      logger.info(`[HybridSearch] Successfully integrated Hybrid Dense + Sparse Search (RRF) onto DocumentStore.`);
    }

    return result;
  };
}
