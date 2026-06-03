import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { ragService } from '../llamaindex/llamaindex.service.js';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Parses variable names enclosed in curly braces {varName} and returns them.
 */
const extractVariables = (template) => {
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
};

/**
 * Replaces {varName} in template string with actual values from scope.
 */
const formatPrompt = (template, scope) => {
  let result = template;
  const vars = extractVariables(template);
  for (const v of vars) {
    const val = scope[v] !== undefined ? scope[v] : '';
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    result = result.replace(new RegExp(`\\{${v}\\}`, 'g'), valStr);
  }
  return result;
};

/**
 * Executes a step-by-step pipeline configuration.
 */
const executeSteps = async (steps, inputs, userId) => {
  const scope = { ...inputs };
  const stepsExecution = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let success = true;
  let errorMsg = null;

  for (const step of steps) {
    const stepStart = Date.now();
    let stepInput = {};
    let stepOutput = null;
    let stepStatus = 'success';
    let stepError = null;

    try {
      switch (step.type) {
        case 'prompt': {
          const template = step.config.template || '';
          stepInput = { template, scope };
          const rendered = formatPrompt(template, scope);
          stepOutput = rendered;
          scope[step.name] = rendered;
          break;
        }

        case 'llm': {
          const promptText = scope[step.config.promptSource || ''] || step.config.systemPrompt || '';
          const temperature = step.config.temperature ?? 0.7;
          const maxOutputTokens = step.config.maxOutputTokens ?? 1024;
          const modelName = step.config.model || 'gemini-3.5-flash';

          stepInput = { promptText, modelName, temperature };

          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
              temperature,
              maxOutputTokens,
            },
          });

          const response = result.response;
          const responseText = response.text();

          stepOutput = responseText;
          scope[step.name] = responseText;

          const usage = response.usageMetadata || {};
          totalPromptTokens += usage.promptTokenCount || Math.ceil(promptText.length / 4);
          totalCompletionTokens += usage.candidatesTokenCount || Math.ceil(responseText.length / 4);
          break;
        }

        case 'parser': {
          const sourceText = scope[step.config.sourceVariable || ''] || '';
          stepInput = { sourceText };

          let cleanText = sourceText.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
          }

          try {
            const parsed = JSON.parse(cleanText);
            stepOutput = parsed;
            scope[step.name] = parsed;
          } catch (err) {
            logger.warn(`JSON parser failed, attempting key extraction: ${err.message}`);
            const extracted = {};
            const fields = step.config.expectedFields || [];
            for (const f of fields) {
              const regex = new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`, 'i');
              const match = cleanText.match(regex);
              if (match) {
                extracted[f] = match[1];
              }
            }
            stepOutput = extracted;
            scope[step.name] = extracted;
          }
          break;
        }

        case 'retriever': {
          const queryTemplate = step.config.queryTemplate || '{query}';
          const queryText = formatPrompt(queryTemplate, scope);
          stepInput = { queryText };

          const context = await ragService.queryDocument(queryText, userId);
          stepOutput = context;
          scope[step.name] = context;
          break;
        }

        case 'tool': {
          const toolName = step.config.toolName;
          const params = step.config.params || {};
          const resolvedParams = {};
          for (const [key, val] of Object.entries(params)) {
            resolvedParams[key] = typeof val === 'string' ? formatPrompt(val, scope) : val;
          }

          stepInput = { toolName, params: resolvedParams };
          stepOutput = {
            executed: true,
            tool: toolName,
            timestamp: new Date().toISOString(),
            result: `Mock successful trigger of tool: ${toolName}`,
          };
          scope[step.name] = stepOutput;
          break;
        }

        case 'branch': {
          const variable = step.config.conditionVariable;
          const operator = step.config.operator || 'equals';
          const targetValue = step.config.value;
          const currentValue = scope[variable];

          stepInput = { variable, currentValue, operator, targetValue };

          let branchMatch = false;
          if (operator === 'equals') {
            branchMatch = String(currentValue) === String(targetValue);
          } else if (operator === 'contains') {
            branchMatch = String(currentValue).includes(String(targetValue));
          } else if (operator === 'greaterThan') {
            branchMatch = Number(currentValue) > Number(targetValue);
          }

          stepOutput = { match: branchMatch };
          scope[step.name] = stepOutput;

          if (branchMatch && step.config.thenSteps) {
            for (const subStep of step.config.thenSteps) {
              const subStart = Date.now();
              const renderedSub = formatPrompt(subStep.template || '', scope);
              scope[subStep.name] = renderedSub;
              stepsExecution.push({
                stepName: `${step.name}_then_${subStep.name}`,
                stepType: 'prompt',
                input: subStep,
                output: renderedSub,
                durationMs: Date.now() - subStart,
                status: 'success',
              });
            }
          }
          break;
        }

        default:
          throw new Error(`Unsupported chain step type: ${step.type}`);
      }
    } catch (stepErr) {
      stepStatus = 'failed';
      stepError = stepErr.message;
      success = false;
      errorMsg = stepErr.message;
      logger.error(`Chain step [${step.name}] failed:`, stepErr);
      throw stepErr;
    } finally {
      stepsExecution.push({
        stepName: step.name,
        stepType: step.type,
        input: stepInput,
        output: stepOutput,
        durationMs: Date.now() - stepStart,
        status: stepStatus,
        error: stepError,
      });
    }
  }

  return {
    success,
    error: errorMsg,
    stepsExecution,
    outputs: scope,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
};

/**
 * Executes a custom chain pipeline step-by-step.
 */
const executeChain = async (chainId, inputs, userId) => {
  const tStart = Date.now();
  const chain = await LangchainChain.findById(chainId);
  if (!chain) {
    throw new Error(`LangChain chain not found: ${chainId}`);
  }

  const execution = new LangchainExecution({
    chainId,
    userId,
    inputs,
    status: 'running',
  });
  await execution.save();

  try {
    const runResult = await executeSteps(chain.steps, inputs, userId);

    const duration = Date.now() - tStart;
    execution.status = 'success';
    execution.stepsExecution = runResult.stepsExecution;
    execution.outputs = runResult.outputs;
    execution.totalDurationMs = duration;
    execution.tokenUsage = runResult.tokenUsage;

    // GCS log backup simulator
    const backupDir = path.resolve('storage/ragsystem/telemetry');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const logFilePath = path.join(backupDir, `lcel_execution_${execution._id}.json`);
    fs.writeFileSync(logFilePath, JSON.stringify(execution.toJSON(), null, 2));
    execution.gcsLogUri = `gs://${config.gcs?.presentation_bucket || 'alti_assistant_presentation'}/lcel_logs/lcel_execution_${execution._id}.json`;

    await execution.save();
    return execution;
  } catch (chainErr) {
    const duration = Date.now() - tStart;
    execution.status = 'failed';
    execution.totalDurationMs = duration;
    await execution.save();
    throw chainErr;
  }
};

export const LangchainExecutionService = {
  executeChain,
  executeSteps,
};
