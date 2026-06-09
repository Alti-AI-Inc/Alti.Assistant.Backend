import { generateImageUsingVertexAI } from '../googleService.js';
import {
  generateClarifyingQuestions,
  isUserFinished,
  updateRefinedPrompt,
  compileFinalPrompt,
} from '../llmService.js';

/**
 * Node: Starts the conversation by analyzing the initial prompt and asking the first question.
 */
export const analyzeInitialPromptNode = async (state) => {
  console.log('--- Node: analyzeInitialPromptNode ---', state);
  const { initialPrompt } = state;
  let responseMessage;
  let remainingQuestions = [];
  let refinedPrompt = initialPrompt; // Initialize refinedPrompt

  try {
    const generatedQuestions = await generateClarifyingQuestions(initialPrompt);
    const firstQuestion = generatedQuestions.shift(); // Get the first question

    if (firstQuestion) {
      responseMessage = firstQuestion;
      remainingQuestions = generatedQuestions;
    } else {
      // If no questions were generated, provide a default confirmation message.
      responseMessage = "I don't have any specific questions, but I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?";
      // remainingQuestions is already an empty array.
    }
  } catch (error) {
    console.error('Error in analyzeInitialPromptNode:', error);
    responseMessage = 'Sorry, I encountered an error while trying to understand your request. Please try again.';
    remainingQuestions = []; // Ensure questions are empty on error
  }

  const newHistoryEntry = { type: 'ai', message: responseMessage };
  return {
    refinedPrompt: refinedPrompt,
    questions: remainingQuestions,
    responseMessage: responseMessage,
    conversationHistory: [newHistoryEntry], // This is the initial history, so no spread needed.
  };
};

/**
 * Node: Processes the user's response, updating the prompt with new details (the "memory" step).
 */
export const processUserResponseNode = async (state) => {
  console.log('--- Node: processUserResponseNode ---');
  const { refinedPrompt, userResponse, conversationHistory } = state;
  let updatedPrompt = refinedPrompt;
  let responseMessage = null; // Initialize as null for success, will be error message on failure
  let newHistoryEntry;

  try {
    updatedPrompt = await updateRefinedPrompt(
      refinedPrompt,
      userResponse,
      conversationHistory
    );
    newHistoryEntry = { type: 'user', message: userResponse };
  } catch (error) {
    console.error('Error in processUserResponseNode:', error);
    responseMessage = 'Sorry, I encountered an error while processing your response. Please try again.';
    newHistoryEntry = { type: 'ai', message: responseMessage };
    // If an error occurs, we return the error message and keep the refinedPrompt as is.
  }

  return {
    refinedPrompt: updatedPrompt,
    responseMessage: responseMessage, // Will be null on success, error message on failure
    conversationHistory: [...conversationHistory, newHistoryEntry],
  };
};

/**
 * Node: Asks the next question from the list.
 */
export const askQuestionNode = async (state) => {
  console.log('--- Node: askQuestionNode ---');
  const { questions, conversationHistory } = state;
  const nextQuestion = questions.shift(); // Get the next question

  let responseMessage;
  if (nextQuestion) {
    responseMessage = nextQuestion;
  } else {
    // This case should ideally not be reached if routing is correct,
    // but as a fallback, provide a message.
    responseMessage = "It seems I've run out of questions. Should I proceed with generating the image, or is there anything else you'd like to add?";
  }

  const newHistoryEntry = { type: 'ai', message: responseMessage };
  return {
    questions: questions, // Update the list of remaining questions (modified by shift)
    responseMessage: responseMessage,
    conversationHistory: [...conversationHistory, newHistoryEntry],
  };
};

/**
 * Node: Asks the user for final confirmation if there are no more questions.
 */
export const getConfirmationNode = async (state) => {
  console.log('--- Node: getConfirmationNode ---');
  const { conversationHistory } = state;
  const message =
    "I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?";
  const newHistoryEntry = { type: 'ai', message };
  return {
    responseMessage: message,
    conversationHistory: [...conversationHistory, newHistoryEntry],
  };
};

/**
 * Node: Compiles the final prompt for the image generator.
 */
export const compileFinalPromptNode = async (state) => {
  console.log('--- Node: compileFinalPromptNode ---');
  const { refinedPrompt, conversationHistory } = state;
  let finalPrompt = null;
  let message;

  try {
    finalPrompt = await compileFinalPrompt(refinedPrompt);
    message = "Great! I've created a detailed prompt based on our conversation. Now generating your image, this may take a moment...";
  } catch (error) {
    console.error('Error in compileFinalPromptNode:', error);
    message = 'Sorry, I encountered an error while finalizing the prompt. Please try again.';
  }

  const newHistoryEntry = { type: 'ai', message };
  return {
    finalPrompt,
    responseMessage: message,
    conversationHistory: [...conversationHistory, newHistoryEntry],
  };
};

/**
 * Node: Calls the image generation service.
 */
export const generateImageNode = async (state) => {
  console.log('--- Node: generateImageNode ---');
  const { finalPrompt, conversationHistory } = state;
  let imageUrl = null;
  let responseMessage;

  try {
    imageUrl = await generateImageUsingVertexAI(finalPrompt);

    if (!imageUrl) {
      responseMessage = 'Sorry, I encountered an error while generating the image. Please try again.';
    } else {
      responseMessage = "Here is your generated image! Let me know if you'd like to create another one.";
    }
  } catch (error) {
    console.error('Error in generateImageNode:', error);
    responseMessage = 'Sorry, I encountered an unexpected error while generating the image. Please try again.';
  }

  const newHistoryEntry = { type: 'ai', message: responseMessage };
  return {
    imageUrl,
    responseMessage: responseMessage,
    conversationHistory: [...conversationHistory, newHistoryEntry],
  };
};

// --- Routers ---

/**
 * Router: Determines the initial path of the conversation (first message vs. subsequent messages).
 */
export const routeInitial = (state) => {
  console.log('--- Router: routeInitial ---');
  // If conversationHistory is empty, it's the first message.
  console.log('Conversation History Length:', state.conversationHistory.length); // Corrected console log
  if (state.conversationHistory.length === 0) {
    return 'analyze_prompt';
  }
  // Otherwise, it's a subsequent message in the conversation.
  return 'process_response';
};

/**
 * Router: After processing a user's response, decides the next action.
 */
export const routeNextStep = async (state) => {
  console.log('--- Router: routeNextStep ---');
  const { questions, userResponse } = state;
  let userIsFinished = false;

  try {
    userIsFinished = await isUserFinished(userResponse); // Call once
    console.log('Is user finished?', userIsFinished, userResponse);
  } catch (error) {
    console.error('Error checking if user is finished:', error);
    // If the LLM service fails, we can't reliably determine if the user is finished.
    // Default to not finished, and let the question/confirmation logic handle it.
  }

  // First, check if the user has explicitly said they are finished.
  if (userIsFinished) {
    return 'compile_prompt';
  }

  // If there are still pre-defined questions, ask the next one.
  if (questions && questions.length > 0) {
    return 'ask_question';
  }

  // If no more questions, ask the user for confirmation to proceed.
  return 'get_confirmation';
};