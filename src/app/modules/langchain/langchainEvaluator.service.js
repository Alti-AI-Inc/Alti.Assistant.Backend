import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainChainVersion from './langchain-version.model.js';
import { LangchainExecutionService } from './langchainExecution.service.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key || 'mock-key');

/**
 * Grades the output of a chain run using Gemini.
 */
const gradeOutputWithGemini = async (input, output, expectedCriteria) => {
  const modelName = 'gemini-3.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const evaluationPrompt = `
You are an expert AI evaluator. Grade the quality of an AI model's output based on a given input and evaluation criteria.

Input Variables/Scope:
${JSON.stringify(input, null, 2)}

Expected Evaluation Criteria:
${expectedCriteria || 'Produce a relevant, helpful, and high-quality response.'}

AI Model Output to Grade:
${typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output)}

You MUST grade this output on three vectors, providing a score between 0.0 and 1.0 (where 0.0 is completely failed/irrelevant, and 1.0 is absolute perfection) and a brief justification:

1. Relevance: How well did the output address the inputs and context? Does it stay on topic and provide what is needed?
2. Factual Accuracy: How accurate, logical, consistent, and factual is the output? Are there hallucinations or contradictions?
3. Structure Adherence: Does the output follow specified format guidelines, styling, JSON structures, or other structural expectations?

You MUST return your response as a valid JSON object ONLY, with no extra text or markdown formatting blocks. Do not put markdown like \`\`\`json. Return exactly this JSON structure:
{
  "relevance": {
    "score": 0.85,
    "justification": "Explanation here..."
  },
  "factualAccuracy": {
    "score": 0.9,
    "justification": "Explanation here..."
  },
  "structureAdherence": {
    "score": 1.0,
    "justification": "Explanation here..."
  }
}
`;

  try {
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: evaluationPrompt }] }]
    });

    let text = response.response.text().trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    }

    try {
      const parsed = JSON.parse(text);
      return {
        relevance: parsed.relevance || { score: 0.5, justification: 'Unknown' },
        factualAccuracy: parsed.factualAccuracy || { score: 0.5, justification: 'Unknown' },
        structureAdherence: parsed.structureAdherence || { score: 0.5, justification: 'Unknown' }
      };
    } catch (e) {
      logger.warn(`Failed to parse Gemini grader output JSON. Raw response: ${text}`);
      // Fallback parser attempt
      const relevanceScore = parseFloat(text.match(/"relevance"\s*:\s*{\s*"score"\s*:\s*([0-9.]+)/)?.[1] || 0.5);
      const accuracyScore = parseFloat(text.match(/"factualAccuracy"\s*:\s*{\s*"score"\s*:\s*([0-9.]+)/)?.[1] || 0.5);
      const structureScore = parseFloat(text.match(/"structureAdherence"\s*:\s*{\s*"score"\s*:\s*([0-9.]+)/)?.[1] || 0.5);
      return {
        relevance: { score: relevanceScore, justification: 'Parsed from fallback' },
        factualAccuracy: { score: accuracyScore, justification: 'Parsed from fallback' },
        structureAdherence: { score: structureScore, justification: 'Parsed from fallback' }
      };
    }
  } catch (err) {
    logger.error('Gemini grader failed:', err);
    return {
      relevance: { score: 0.5, justification: `Grading failed: ${err.message}` },
      factualAccuracy: { score: 0.5, justification: `Grading failed: ${err.message}` },
      structureAdherence: { score: 0.5, justification: `Grading failed: ${err.message}` }
    };
  }
};

/**
 * Runs a comparative benchmark between two prompt chain version configurations.
 */
const benchmarkVersions = async (chainId, versionA, versionB, testSuite, userId) => {
  logger.info(`Benchmarking chain ${chainId} (v${versionA} vs v${versionB}) for user ${userId}`);
  
  // Resolve chain
  const chain = await LangchainChain.findById(chainId);
  if (!chain) {
    throw new Error(`Chain not found: ${chainId}`);
  }

  // Resolve steps for Version A
  let stepsA = null;
  let labelA = `v${versionA}`;
  if (String(versionA).toLowerCase() === 'current') {
    stepsA = chain.steps;
    labelA = `Current (v${chain.version || 1})`;
  } else {
    const snapA = await LangchainChainVersion.findOne({ chainId, versionNumber: Number(versionA) });
    if (!snapA) {
      throw new Error(`Version snapshot v${versionA} not found for chain ${chainId}`);
    }
    stepsA = snapA.steps;
  }

  // Resolve steps for Version B
  let stepsB = null;
  let labelB = `v${versionB}`;
  if (String(versionB).toLowerCase() === 'current') {
    stepsB = chain.steps;
    labelB = `Current (v${chain.version || 1})`;
  } else {
    const snapB = await LangchainChainVersion.findOne({ chainId, versionNumber: Number(versionB) });
    if (!snapB) {
      throw new Error(`Version snapshot v${versionB} not found for chain ${chainId}`);
    }
    stepsB = snapB.steps;
  }

  const normalizedTestSuite = testSuite && testSuite.length > 0 
    ? testSuite 
    : [
        {
          inputs: chain.inputVariables.reduce((acc, curr) => ({ ...acc, [curr]: 'Test input value' }), {}),
          expectedCriteria: 'Generate a structured response addressing inputs.'
        }
      ];

  const comparisons = [];
  
  let totalDurationA = 0;
  let totalDurationB = 0;
  let totalTokensA = 0;
  let totalTokensB = 0;
  
  let totalRelevanceA = 0;
  let totalRelevanceB = 0;
  let totalAccuracyA = 0;
  let totalAccuracyB = 0;
  let totalStructureA = 0;
  let totalStructureB = 0;

  for (let i = 0; i < normalizedTestSuite.length; i++) {
    const testCase = normalizedTestSuite[i];
    const inputs = testCase.inputs || {};
    const expected = testCase.expectedCriteria || '';

    // Run Version A
    const startA = Date.now();
    let resultA;
    try {
      resultA = await LangchainExecutionService.executeSteps(stepsA, inputs, userId);
    } catch (err) {
      resultA = { success: false, error: err.message, outputs: {}, tokenUsage: { totalTokens: 0 } };
    }
    const durationA = Date.now() - startA;

    // Run Version B
    const startB = Date.now();
    let resultB;
    try {
      resultB = await LangchainExecutionService.executeSteps(stepsB, inputs, userId);
    } catch (err) {
      resultB = { success: false, error: err.message, outputs: {}, tokenUsage: { totalTokens: 0 } };
    }
    const durationB = Date.now() - startB;

    // Grade outcomes
    const outA = resultA.outputs || {};
    const outB = resultB.outputs || {};

    const gradesA = resultA.success 
      ? await gradeOutputWithGemini(inputs, outA, expected)
      : { relevance: { score: 0, justification: 'Execution failed' }, factualAccuracy: { score: 0, justification: 'Execution failed' }, structureAdherence: { score: 0, justification: 'Execution failed' } };
      
    const gradesB = resultB.success 
      ? await gradeOutputWithGemini(inputs, outB, expected)
      : { relevance: { score: 0, justification: 'Execution failed' }, factualAccuracy: { score: 0, justification: 'Execution failed' }, structureAdherence: { score: 0, justification: 'Execution failed' } };

    // Accrue
    totalDurationA += durationA;
    totalDurationB += durationB;
    totalTokensA += resultA.tokenUsage?.totalTokens || 0;
    totalTokensB += resultB.tokenUsage?.totalTokens || 0;

    totalRelevanceA += gradesA.relevance.score;
    totalRelevanceB += gradesB.relevance.score;
    totalAccuracyA += gradesA.factualAccuracy.score;
    totalAccuracyB += gradesB.factualAccuracy.score;
    totalStructureA += gradesA.structureAdherence.score;
    totalStructureB += gradesB.structureAdherence.score;

    comparisons.push({
      testCaseIndex: i,
      inputs,
      expectedCriteria: expected,
      versionA: {
        success: resultA.success,
        error: resultA.error,
        durationMs: durationA,
        tokenUsage: resultA.tokenUsage || { totalTokens: 0 },
        grades: gradesA,
        outputs: outA
      },
      versionB: {
        success: resultB.success,
        error: resultB.error,
        durationMs: durationB,
        tokenUsage: resultB.tokenUsage || { totalTokens: 0 },
        grades: gradesB,
        outputs: outB
      }
    });
  }

  const numCases = normalizedTestSuite.length;
  
  const summaryA = {
    label: labelA,
    avgLatencyMs: totalDurationA / numCases,
    avgTokens: totalTokensA / numCases,
    avgRelevance: totalRelevanceA / numCases,
    avgFactualAccuracy: totalAccuracyA / numCases,
    avgStructureAdherence: totalStructureA / numCases,
    overallQualityScore: (totalRelevanceA + totalAccuracyA + totalStructureA) / (3 * numCases)
  };

  const summaryB = {
    label: labelB,
    avgLatencyMs: totalDurationB / numCases,
    avgTokens: totalTokensB / numCases,
    avgRelevance: totalRelevanceB / numCases,
    avgFactualAccuracy: totalAccuracyB / numCases,
    avgStructureAdherence: totalStructureB / numCases,
    overallQualityScore: (totalRelevanceB + totalAccuracyB + totalStructureB) / (3 * numCases)
  };

  const deltaQuality = summaryB.overallQualityScore - summaryA.overallQualityScore;
  const deltaLatency = summaryB.avgLatencyMs - summaryA.avgLatencyMs;
  const deltaTokens = summaryB.avgTokens - summaryA.avgTokens;

  return {
    success: true,
    chainId,
    chainName: chain.name,
    versionA: String(versionA),
    versionB: String(versionB),
    summary: {
      versionA: summaryA,
      versionB: summaryB,
      deltas: {
        qualityScoreImprovement: parseFloat(deltaQuality.toFixed(3)),
        latencyDeltaMs: parseFloat(deltaLatency.toFixed(1)),
        tokenEfficiencyDelta: parseFloat(deltaTokens.toFixed(1))
      }
    },
    comparisons
  };
};

export const langchainEvaluatorService = {
  benchmarkVersions
};
