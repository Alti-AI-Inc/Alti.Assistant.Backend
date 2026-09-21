import { Embeddings } from '@langchain/core/embeddings';
import axios from 'axios';

// Helper function to L2 normalize a vector
function L2Normalize(vector) {
  const sumOfSquares = vector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

/**
 * A safe wrapper around a generic embeddings endpoint that handles api restrictions,
 * and applies L2 normalization to sliced vectors for Matryoshka learning matching target database dimensions.
 */
export class SafeGoogleGenerativeAIEmbeddings extends Embeddings {
  constructor(fields) {
    super(fields || {});
    // Default to 768 dimensions
    this.targetDimension = fields?.targetDimension || 768;
    this.endpoint = fields?.endpoint || 'http://localhost:8080/embed'; // Configurable endpoint
  }

  async embedDocuments(documents) {
    let rawEmbeddings = [];
    try {
      const response = await axios.post(this.endpoint, { inputs: documents });
      rawEmbeddings = response.data.embeddings || response.data;
    } catch (e) {
      console.warn('Embedding endpoint failed, using zeroes', e.message);
      rawEmbeddings = documents.map(() => new Array(this.targetDimension).fill(0));
    }
    
    return rawEmbeddings.map(emb => {
      if (!emb || emb.length === 0) {
        // Return a zeroed vector of the target dimension as a safe fallback
        return new Array(this.targetDimension).fill(0);
      }
      
      const sliced = emb.slice(0, this.targetDimension);
      const normalized = L2Normalize(sliced);
      
      if (normalized.length < this.targetDimension) {
        return [...normalized, ...new Array(this.targetDimension - normalized.length).fill(0)];
      }
      return normalized;
    });
  }

  async embedQuery(document) {
    const rawEmbeddings = await this.embedDocuments([document]);
    return rawEmbeddings[0] || new Array(this.targetDimension).fill(0);
  }
}
