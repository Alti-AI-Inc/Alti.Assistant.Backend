import { StateGraph, END, START } from '@langchain/langgraph';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { askQuery } from '../llamaindex.indexer.js';
import { GoogleSearchGroundingTool } from '../../deep_research/utils/tavily-utils.js';
import { langsmithMiddleware } from './langsmithMiddleware.js';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';

// Define the state schema for our self-correcting RAG agent loop
export const agenticRAGState = {
  query: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  userId: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  retrievedContext: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  citations: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },
  webSearchUsed: {
    reducer: (x, y) => y ?? x,
    default: () => false,
  },
  generation: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  generationAttempt: {
    reducer: (x, y) => y ?? x,
    default: () => 0,
  },
  isRelevant: {
    reducer: (x, y) => y ?? x,
    default: () => false,
  },
  error: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  }
};

// Initialize Gemini LLM using `@langchain/google-genai`
const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  temperature: 0,
  apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
});

/**
 * Retrieve Node: Calls LlamaIndex parallel multi-query index retriever
 */
async function retrieveNode(state) {
  logger.info(`[LangGraph RAG] Retrieving context for query: "${state.query}"`);
  try {
    const result = await askQuery(state.query, state.userId);
    const hasDocuments = result && result.sources && result.sources.length > 0;
    
    if (!hasDocuments) {
      return {
        retrievedContext: '',
        citations: [],
        isRelevant: false
      };
    }

    const contextStr = result.content || '';
    const citations = result.sources.map((s, idx) => {
      const docName = s.extractedTitle || 'Uploaded Document';
      const downloadUrl = `/api/v1/rag-system/documents/${s.docId || 'active'}/download`;
      return {
        index: idx + 1,
        url: downloadUrl,
        title: docName,
        domain: 'Data Vault',
        snippet: s.snippet || ''
      };
    });

    return {
      retrievedContext: contextStr,
      citations,
      isRelevant: true
    };
  } catch (err) {
    logger.warn(`[LangGraph RAG] Local LlamaIndex retrieval failed/empty: ${err.message}`);
    return {
      retrievedContext: '',
      citations: [],
      isRelevant: false
    };
  }
}

/**
 * Grade Documents Node: Evaluate document relevance to decide on search fallback
 */
async function gradeDocumentsNode(state) {
  if (!state.retrievedContext || state.retrievedContext.length < 50) {
    logger.info('[LangGraph RAG] Documents empty, marking as IRRELEVANT.');
    return { isRelevant: false };
  }

  logger.info('[LangGraph RAG] Grading retrieved documents relevance...');
  const systemPrompt = `You are an expert retrieval relevance auditor. Evaluate whether the provided document context contains useful, relevant, or sufficient details to answer the user's query.
  
Query: "${state.query}"

Document Context:
${state.retrievedContext}

Respond with exactly one word: "YES" if the context is relevant and contains useful information to help answer the question, or "NO" if the context is completely unrelated or insufficient to construct a grounded answer. Do not add any punctuation or extra words.`;

  try {
    const response = await llm.invoke([new SystemMessage(systemPrompt)], {
      callbacks: langsmithMiddleware.getTraceCallbacks('Relevance-Grader')
    });
    const ans = response.content.trim().toUpperCase();
    const isRelevant = ans.includes('YES');
    logger.info(`[LangGraph RAG] Relevance auditor decision: ${isRelevant ? 'RELEVANT (YES)' : 'IRRELEVANT (NO)'}`);
    return { isRelevant };
  } catch (err) {
    logger.error('[LangGraph RAG] Relevance grading error, defaulting to true:', err);
    return { isRelevant: true };
  }
}

/**
 * Web Search Node: Fallback using high-fidelity Google Search Grounding via Gemini
 */
async function webSearchNode(state) {
  logger.info(`[LangGraph RAG] Falling back to real-time Google Search Grounding for: "${state.query}"`);
  try {
    const searchTool = new GoogleSearchGroundingTool();
    const searchResult = await searchTool.invoke({ query: state.query });
    
    const searchAnswer = searchResult.answer || '';
    const searchCitations = (searchResult.results || []).map((res, idx) => ({
      index: state.citations.length + idx + 1,
      url: res.url,
      title: res.title,
      domain: 'Google Search',
      snippet: res.content
    }));

    const enrichedContext = `${state.retrievedContext}\n\n[Google Search Grounding Results]\n${searchAnswer}`;

    return {
      retrievedContext: enrichedContext,
      citations: searchCitations,
      webSearchUsed: true,
      isRelevant: true
    };
  } catch (err) {
    logger.error(`[LangGraph RAG] Google Search Grounding fallback failed: ${err.message}`);
    return {
      error: `Web search fallback failed: ${err.message}`
    };
  }
}

/**
 * Generate Node: Synthesize grounded response using retrieved context
 */
async function generateNode(state) {
  logger.info(`[LangGraph RAG] Synthesizing grounded response (Attempt #${state.generationAttempt + 1})...`);
  
  const systemPrompt = `You are a world-class hybrid RAG response generator. 
Your objective is to provide a highly accurate, structured, and factual response to the user's query, strictly grounded in the provided context.

Context documents:
${state.retrievedContext}

Instructions:
1. Answer the user query comprehensively using ONLY details present in the context.
2. If Google Search Grounding was utilized, synthesize the live search details clearly.
3. Incorporate citations cleanly. Refer to source indexes using bracket notation e.g. [Source #1], [Source #2].
4. Maintain a professional, objective tone. Do not make up facts.`;

  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.query)
    ], {
      callbacks: langsmithMiddleware.getTraceCallbacks('Grounded-Generator')
    });
    
    return {
      generation: response.content,
      generationAttempt: state.generationAttempt + 1
    };
  } catch (err) {
    logger.error(`[LangGraph RAG] Generation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Hallucination Grade Node: Audit response for strict faithfulness to sources
 */
async function hallucinationGradeNode(state) {
  logger.info('[LangGraph RAG] Executing hallucination audit on generated draft...');
  
  const systemPrompt = `You are an elite cognitive quality control auditor. 
Evaluate whether the generated response contains any external, unsubstantiated facts, or hallucinations that are not backed up by the provided context documents.

Context:
${state.retrievedContext}

Generated Draft:
${state.generation}

Respond with exactly one word: "YES" if the draft contains hallucinations, unsupported claims, or fabricated statements. Respond with "NO" if the draft is 100% faithful, fully grounded, and supported by the context without extra fabrications.`;

  try {
    const response = await llm.invoke([new SystemMessage(systemPrompt)], {
      callbacks: langsmithMiddleware.getTraceCallbacks('Hallucination-Auditor')
    });
    const ans = response.content.trim().toUpperCase();
    const hasHallucinations = ans.includes('YES');
    logger.info(`[LangGraph RAG] Hallucination audit result: ${hasHallucinations ? 'HALLUCINATION DETECTED (YES)' : 'CLEAN & FAITHFUL (NO)'}`);
    
    return {
      hallucinationScore: hasHallucinations ? 1 : 0
    };
  } catch (err) {
    logger.error('[LangGraph RAG] Hallucination audit error:', err);
    return { hallucinationScore: 0 };
  }
}

// ═════ BUILD STATE GRAPH FLOWS ═════

const workflow = new StateGraph({ channels: agenticRAGState });

// Register Nodes
workflow.addNode('retrieve', retrieveNode);
workflow.addNode('grade_documents', gradeDocumentsNode);
workflow.addNode('web_search', webSearchNode);
workflow.addNode('generate', generateNode);
workflow.addNode('hallucination_grade', hallucinationGradeNode);

// Define Edges
workflow.addEdge(START, 'retrieve');
workflow.addEdge('retrieve', 'grade_documents');

// Route based on document relevance
workflow.addConditionalEdges(
  'grade_documents',
  (state) => {
    if (state.isRelevant) return 'generate';
    return 'web_search';
  },
  {
    generate: 'generate',
    web_search: 'web_search'
  }
);

workflow.addEdge('web_search', 'generate');
workflow.addEdge('generate', 'hallucination_grade');

// Route based on hallucination grade (with max retry safeguard)
workflow.addConditionalEdges(
  'hallucination_grade',
  (state) => {
    const hasHallucinations = state.hallucinationScore > 0;
    const underRetryLimit = state.generationAttempt < 2;
    
    if (hasHallucinations && underRetryLimit) {
      logger.warn('[LangGraph RAG] Hallucination check failed! Re-routing back to generate for self-correction.');
      return 'generate';
    }
    return END;
  },
  {
    generate: 'generate',
    [END]: END
  }
);

// Compile the RAG Graph
export const agenticRAGGraph = workflow.compile();

/**
 * Execute the stateful agentic RAG search and self-correcting synthesis graph
 * @param {string} query - User search query
 * @param {string} userId - User identifier
 * @returns {Promise<object>} Grounded response containing content and citations
 */
export async function executeAgenticRAG(query, userId) {
  try {
    logger.info(`[LangGraph RAG Coordinator] Invocating state graph for user ${userId}`);
    const threadId = `rag_${userId}_${Date.now()}`;
    
    const config = {
      configurable: {
        thread_id: threadId
      }
    };

    const initialState = {
      query,
      userId,
      generationAttempt: 0,
      webSearchUsed: false
    };

    const finalState = await agenticRAGGraph.invoke(initialState, config);
    logger.info('[LangGraph RAG Coordinator] Invocation completed successfully.');

    return {
      success: true,
      content: finalState.generation || 'No response generated.',
      sources: (finalState.citations || []).map(c => ({
        docId: c.url?.split('/')?.slice(-2)?.[0] || 'active',
        extractedTitle: c.title,
        score: 1.0,
        snippet: c.snippet || ''
      })),
      webSearchUsed: finalState.webSearchUsed
    };
  } catch (err) {
    logger.error('[LangGraph RAG Coordinator] Critical execution error:', err);
    throw err;
  }
}
