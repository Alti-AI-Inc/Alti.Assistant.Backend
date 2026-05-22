import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Helper function to L2 normalize a vector
function L2Normalize(vector) {
  const sumOfSquares = vector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

/**
 * A safe wrapper around GoogleGenerativeAIEmbeddings that handles api restrictions,
 * enforces gemini-embedding-001 as the working model, and applies L2 normalization
 * to sliced vectors for Matryoshka learning matching target database dimensions.
 */
export class SafeGoogleGenerativeAIEmbeddings extends GoogleGenerativeAIEmbeddings {
  constructor(fields) {
    const targetModel = 'gemini-embedding-001';
    
    super({
      ...fields,
      model: targetModel,
      modelName: targetModel,
    });
    
    // Default to 768 dimensions (gemini-embedding-001 defaults to 3072, but we can slice to 768 or 1536)
    this.targetDimension = fields.targetDimension || 768;
  }

  async embedDocuments(documents) {
    const rawEmbeddings = await super.embedDocuments(documents);
    
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
    const rawEmbedding = await super.embedQuery(document);
    
    if (!rawEmbedding || rawEmbedding.length === 0) {
      return new Array(this.targetDimension).fill(0);
    }
    
    const sliced = rawEmbedding.slice(0, this.targetDimension);
    const normalized = L2Normalize(sliced);
    
    if (normalized.length < this.targetDimension) {
      return [...normalized, ...new Array(this.targetDimension - normalized.length).fill(0)];
    }
    return normalized;
  }
}
