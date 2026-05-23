import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Automatically audits custom chain runs and queries Google Gemini to suggest prompt and structure improvements.
 */
const optimizeChain = async (chainId, userId) => {
  try {
    logger.info(`LangchainOptimizer: running diagnostics on chain ${chainId}`);

    // Fetch the chain and its last 15 executions
    const chain = await LangchainChain.findById(chainId);
    if (!chain) {
      throw new Error(`LangChain chain not found: ${chainId}`);
    }

    const executions = await LangchainExecution.find({ chainId, userId })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    if (executions.length === 0) {
      return {
        success: true,
        message: 'No execution traces found for this chain. Execute the chain first to gather optimization telemetry.',
        recommendations: [],
      };
    }

    // Aggregate statistics
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'success').length;
    const successRate = Math.round((successfulExecutions / totalExecutions) * 100);
    const avgDuration = Math.round(executions.reduce((sum, e) => sum + (e.totalDurationMs || 0), 0) / totalExecutions);

    // Identify bottlenecks and failures
    const failures = [];
    const slowSteps = [];
    const stepDurations = {};

    for (const exec of executions) {
      for (const stepRun of exec.stepsExecution || []) {
        // Accumulate durations per step
        if (!stepDurations[stepRun.stepName]) {
          stepDurations[stepRun.stepName] = { totalMs: 0, count: 0 };
        }
        stepDurations[stepRun.stepName].totalMs += stepRun.durationMs || 0;
        stepDurations[stepRun.stepName].count++;

        if (stepRun.status === 'failed') {
          failures.push({
            stepName: stepRun.stepName,
            stepType: stepRun.stepType,
            input: stepRun.input,
            error: stepRun.error,
            timestamp: exec.createdAt,
          });
        }
      }
    }

    // Find slow steps (avg duration > 4 seconds)
    for (const [name, data] of Object.entries(stepDurations)) {
      const avg = Math.round(data.totalMs / data.count);
      if (avg > 4000) {
        slowSteps.push({ stepName: name, avgDurationMs: avg });
      }
    }

    // Call Gemini to suggest prompt refinements
    const traceSummary = {
      chainName: chain.name,
      chainDescription: chain.description,
      successRate: `${successRate}%`,
      avgDurationMs: avgDuration,
      slowSteps,
      frequentFailures: failures.slice(0, 5),
      stepsConfig: chain.steps.map(s => ({ name: s.name, type: s.type, config: s.config })),
    };

    const optimizationPrompt = `You are an expert AI compiler and LangChain optimizer. Analyze the following custom chain execution telemetry and config profile:
${JSON.stringify(traceSummary, null, 2)}

Identify bottlenecks, failed prompts, or parser issues, and suggest:
1. Prompts optimization (how to rewrite the prompts to avoid failures or boost precision).
2. Parameter adjustments (temperature, tokens).
3. Pipeline enhancements (steps re-arrangements).

Return your output as a clean, structured JSON object following this exact schema:
{
  "traceSummary": {
    "successRate": "X%",
    "avgLatencyMs": 999
  },
  "bottlenecks": [
    {
      "stepName": "string",
      "issue": "string",
      "recommendation": "string"
    }
  ],
  "promptRefinements": [
    {
      "stepName": "string",
      "originalPromptPreview": "string",
      "optimizedPromptText": "string",
      "rationale": "string"
    }
  ],
  "parameterTuning": [
    {
      "stepName": "string",
      "param": "temperature" | "maxOutputTokens",
      "currentValue": "string",
      "recommendedValue": "string",
      "rationale": "string"
    }
  ]
}

Ensure your response is raw JSON only, with no markdown styling or wrapping backticks.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: optimizationPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const cleanText = result.response.text().trim();
    const suggestions = JSON.parse(cleanText);

    return {
      success: true,
      chainId,
      telemetry: {
        totalTraces: totalExecutions,
        successRate: `${successRate}%`,
        averageDurationMs: avgDuration,
      },
      optimization: suggestions,
    };
  } catch (err) {
    logger.error('LangchainOptimizer error:', err);
    throw new Error(`Failed to generate chain optimizations: ${err.message}`);
  }
};

export const langchainOptimizerService = {
  optimizeChain,
};
