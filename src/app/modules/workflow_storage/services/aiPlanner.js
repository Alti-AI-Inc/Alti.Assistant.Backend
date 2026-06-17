import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import config from '../../../../../config/index.js';

/**
 * Plan the workflow based on user intent using native Google Gemini.
 * Maps input prompt to a structured execution plan.
 *
 * @param {Object} state - The planning state.
 * @param {string} state.userInput - The natural language request.
 * @returns {Promise<Object>} The planned workflow structure.
 */
export const planWorkflowNode = async (state) => {
  try {
    const { userInput } = state;
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-3.5-flash',
      temperature: 0,
      apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
    });

    const systemPrompt = `You are a workflow planning expert. Create a detailed execution plan for the user's automation request.
Break down the workflow into logical steps. Respond with a JSON object containing:
- workflowType: "single_step" or "multi_step"
- requiredApps: array of app names/slugs needed (e.g. ["gmail", "google_sheets"])
- executionPlan: array of step objects, where each step has:
  * step: 1-indexed step number (integer)
  * app: app name/slug (e.g. "gmail", "google_sheets", "chat", "research", "agents", "google_cloud", "google_workspace", "scripting")
  * action: specific action to perform (e.g. "send_email", "sheets_append", "run_swarm", "conduct_research")
  * description: brief description of what this step does
  * parameters: key-value pairs of parameters required
  * dependencies: array of 1-indexed step numbers that this step depends on (optional)
- totalSteps: total number of steps in executionPlan
- crossStepParameters: key-value pairs of parameters that can be shared or passed between steps
- planningMetadata: object containing:
  * reasoning: description of the plan reasoning
  * confidence: confidence score (float between 0 and 1)
  * executionType: "sequential" or "parallel"`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userInput),
    ]);

    let cleanedResult = response.content;
    if (cleanedResult.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = cleanedResult.replace(regex, '').trim();
    }

    const match = cleanedResult.match(/{[\s\S]*}/);
    if (match) {
      const plan = JSON.parse(match[0]);
      return {
        workflowType: plan.workflowType || 'single_step',
        requiredApps: plan.requiredApps || [],
        executionPlan: plan.executionPlan || [],
        totalSteps: plan.totalSteps || plan.executionPlan?.length || 1,
        crossStepParameters: plan.crossStepParameters || {},
        planningMetadata: {
          reasoning: plan.planningMetadata?.reasoning || 'Workflow planned.',
          confidence: plan.planningMetadata?.confidence || 0.9,
          planningTime: new Date(),
          executionType: plan.planningMetadata?.executionType || 'sequential',
        },
      };
    } else {
      throw new Error('No valid JSON plan found in response.');
    }
  } catch (error) {
    console.error('Error planning workflow:', error);
    return {
      error: {
        message: error.message,
      },
    };
  }
};
