import { generateImageUsingVertexAI } from '../googleService.js';
import {
  generateClarifyingQuestions,
  isUserFinished,
  updateRefinedPrompt,
  compileFinalPrompt,
} from '../llmService.js';

/**
 * @typedef {object} ConversationHistoryEntry
 * @property {'user'|'ai'} type - The type of the speaker.
 * @property {string} message - The message content.
 */

/**
 * @typedef {object} ImageAssistantState
 * @property {string} [initialPrompt] - The user's initial request for image generation.
 * @property {string} [userResponse] - The user's latest response to a question or prompt.
 * @property {string} [refinedPrompt] - The evolving prompt, refined with user details.
 * @property {string[]} [questions] - An array of clarifying questions remaining to be asked.
 * @property {string} [responseMessage] - The message to be displayed to the user.
 * @property {string} [finalPrompt] - The fully compiled prompt ready for image generation.
 * @property {string} [imageUrl] - The URL of the generated image.
 * @property {ConversationHistoryEntry[]} conversationHistory - A chronological list of messages exchanged.
 */

/**
 * Node: Starts the conversation by analyzing the initial prompt and asking the first question.
 * This node is responsible for generating an initial set of clarifying questions based on the user's
 * prompt and preparing the first response to the user.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string} state.initialPrompt - The user's initial request for image generation.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string} returns.refinedPrompt - The prompt refined based on initial analysis (initially same as initialPrompt).
 * @returns {string[]} returns.questions - An array of remaining clarifying questions.
 * @returns {string} returns.responseMessage - The message to be displayed to the user (first question or confirmation).
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history.
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
 * This node takes the user's latest input and integrates it into the `refinedPrompt`,
 * effectively building a more detailed and accurate prompt for image generation.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string} state.refinedPrompt - The current refined prompt.
 * @param {string} state.userResponse - The user's latest response.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string} returns.refinedPrompt - The prompt updated with details from the user's response.
 * @returns {string|null} returns.responseMessage - An error message if processing failed, otherwise `null`.
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history including the user's response.
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
 * This node retrieves the next clarifying question from the `questions` array and prepares it
 * as the `responseMessage` for the user.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string[]} state.questions - An array of remaining clarifying questions.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string[]} returns.questions - The updated array of remaining questions (with the asked question removed).
 * @returns {string} returns.responseMessage - The next question to be displayed to the user.
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history.
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
 * This node generates a standard confirmation message to prompt the user to either
 * proceed with image generation or provide more details.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string} returns.responseMessage - The confirmation message to be displayed to the user.
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history.
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
 * This node takes the `refinedPrompt` and processes it into a `finalPrompt` that is
 * optimized and ready for submission to the image generation service.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string} state.refinedPrompt - The current refined prompt.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string|null} returns.finalPrompt - The fully compiled prompt for image generation, or `null` if an error occurred.
 * @returns {string} returns.responseMessage - A message indicating success or failure of prompt compilation.
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history.
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
 * This node sends the `finalPrompt` to the `generateImageUsingVertexAI` service
 * and handles the response, including potential errors and the generated image URL.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string} state.finalPrompt - The final compiled prompt for image generation.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {Promise<ImageAssistantState>} An object containing the updated state.
 * @returns {string|null} returns.imageUrl - The URL of the generated image, or `null` if generation failed.
 * @returns {string} returns.responseMessage - A message indicating the success or failure of image generation.
 * @returns {ConversationHistoryEntry[]} returns.conversationHistory - The updated conversation history.
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
 * This router checks the conversation history to decide if the current interaction is the
 * very first message from the user or a continuation of an existing conversation.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {ConversationHistoryEntry[]} state.conversationHistory - The current conversation history.
 * @returns {string} The name of the next node to execute (`'analyze_prompt'` for a new conversation, or `'process_response'` for a continuing one).
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
 * This router determines the subsequent step in the conversation flow based on
 * whether the user has indicated they are finished, if there are more clarifying
 * questions to ask, or if a final confirmation is needed before image generation.
 *
 * @param {ImageAssistantState} state - The current state of the conversation.
 * @param {string[]} state.questions - An array of remaining clarifying questions.
 * @param {string} state.userResponse - The user's latest response.
 * @returns {Promise<string>} The name of the next node to execute (`'compile_prompt'`, `'ask_question'`, or `'get_confirmation'`).
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