import { ai } from '../llm.js';
import {
  codeGenerator,
  codeExplainer,
  codeDebugger,
  bestPracticesAdvisor,
  generalCodeAssistant,
} from '../services/geminiCodeService.js';

/**
 * Node: Detects the user's intent using GoogleGenAI.
 */
export const detectIntentNode = async (state) => {
  console.log('--- Node: detectIntentNode ---');
  const { history } = state;
  const userMessage = history[history.length - 1].content;

  const intentDetectionPrompt = `
        Analyze the following user message in a coding assistant conversation and classify its primary intent.
        Choose from one of the following intents:
        - "generate_code": User wants to create new code from a description.
        - "explain_code": User is asking for an explanation of existing code.
        - "debug_code": User is describing an error or a problem with their code and needs help fixing it.
        - "best_practices": User is asking for code reviews, improvements, or best practices.
        - "general_conversation": User is asking a follow-up question, refining a previous request, or having a general chat about the code.

        User Message: "${userMessage}"

        Return only the single intent string (e.g., "generate_code").
    `;

  let intent = 'general_conversation'; // Default intent in case of failure or unexpected response
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: intentDetectionPrompt,
    });
    // Ensure response.text exists and is a string before trimming
    if (response && typeof response.text === 'string') {
      intent = response.text.trim();
    } else {
      console.warn('LLM response.text was not a string or was empty. Defaulting to general_conversation.');
    }
  } catch (error) {
    console.error('Error detecting intent:', error);
    // Fallback to general conversation if intent detection fails due to API error, network issue, etc.
    intent = 'general_conversation';
  }
  console.log('Detected Intent:', intent);
  return { intent };
};

/**
 * Router: Directs the workflow based on the detected intent.
 */
export const routeOnIntent = (state) => {
  console.log(`--- Router: Routing on intent: ${state.intent} ---`);
  const intent = state.intent;

  const validIntents = [
    'generate_code',
    'explain_code',
    'debug_code',
    'best_practices',
  ];

  if (validIntents.includes(intent)) {
    return intent;
  }
  // If the intent is not specific, not recognized, or intent detection failed,
  // use the general assistant as a fallback.
  return 'general_conversation';
};

/**
 * A generic node to execute the appropriate Claude service based on the intent.
 * This reduces code duplication.
 */
const executeTaskNode = (serviceFunction) => async (state) => {
  console.log(`--- Node: Executing task for intent: ${state.intent} ---`);
  const { history } = state;
  let response = null;
  try {
    response = await serviceFunction(history);
  } catch (error) {
    console.error(`Error executing task for intent ${state.intent}:`, error);
    // Return an error message in the response to be handled by subsequent nodes or the workflow.
    // This prevents unhandled promise rejections and allows the workflow to gracefully fail.
    response = { error: `Failed to process your request: ${error.message || 'Unknown error'}` };
  }
  return { response };
};

// Create specific nodes by wrapping the generic executor
export const generateCodeNode = executeTaskNode(codeGenerator);
export const explainCodeNode = executeTaskNode(codeExplainer);
export const debugCodeNode = executeTaskNode(codeDebugger);
export const bestPracticesNode = executeTaskNode(bestPracticesAdvisor);
export const generalConversationNode = executeTaskNode(generalCodeAssistant);