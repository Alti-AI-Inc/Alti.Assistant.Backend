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
  const questions = await generateClarifyingQuestions(initialPrompt);
  const firstQuestion = questions.shift(); // Get the first question

  return {
    refinedPrompt: initialPrompt, // Start refining from the initial idea
    questions: questions, // Store the rest of the questions
    responseMessage: firstQuestion,
    conversationHistory: [{ type: 'ai', message: firstQuestion }],
  };
};

/**
 * Node: Processes the user's response, updating the prompt with new details (the "memory" step).
 */
export const processUserResponseNode = async (state) => {
  console.log('--- Node: processUserResponseNode ---');
  const { refinedPrompt, userResponse, conversationHistory } = state;

  const updatedPrompt = await updateRefinedPrompt(
    refinedPrompt,
    userResponse,
    conversationHistory
  );

  return {
    refinedPrompt: updatedPrompt,
    conversationHistory: [{ type: 'user', message: userResponse }],
  };
};

/**
 * Node: Asks the next question from the list.
 */
export const askQuestionNode = async (state) => {
  console.log('--- Node: askQuestionNode ---');
  const { questions } = state;
  const nextQuestion = questions.shift(); // Get the next question

  return {
    questions: questions, // Update the list of remaining questions
    responseMessage: nextQuestion,
    conversationHistory: [{ type: 'ai', message: nextQuestion }],
  };
};

/**
 * Node: Asks the user for final confirmation if there are no more questions.
 */
export const getConfirmationNode = async (state) => {
  console.log('--- Node: getConfirmationNode ---');
  const message =
    "I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?";
  return {
    responseMessage: message,
    conversationHistory: [{ type: 'ai', message }],
  };
};

/**
 * Node: Compiles the final prompt for the image generator.
 */
export const compileFinalPromptNode = async (state) => {
  console.log('--- Node: compileFinalPromptNode ---');
  const { refinedPrompt } = state;
  const finalPrompt = await compileFinalPrompt(refinedPrompt);
  const message =
    "Great! I've created a detailed prompt based on our conversation. Now generating your image, this may take a moment...";
  return {
    finalPrompt,
    responseMessage: message,
    conversationHistory: [{ type: 'ai', message }],
  };
};

/**
 * Node: Calls the image generation service.
 */
export const generateImageNode = async (state) => {
  console.log('--- Node: generateImageNode ---');
  const { finalPrompt } = state;
  const imageUrl = await generateImageUsingVertexAI(finalPrompt);

  if (!imageUrl) {
    return {
      responseMessage:
        'Sorry, I encountered an error while generating the image. Please try again.',
    };
  }

  return {
    imageUrl,
    responseMessage:
      "Here is your generated image! Let me know if you'd like to create another one.",
  };
};

// --- Routers ---

/**
 * Router: Determines the initial path of the conversation (first message vs. subsequent messages).
 */
export const routeInitial = (state) => {
  console.log('--- Router: routeInitial ---');
  // If conversationHistory is empty, it's the first message.
  console.log('Conversation History Length:', state);

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
  console.log(
    'Is user finished?',
    await isUserFinished(userResponse),
    userResponse
  );

  // First, check if the user has explicitly said they are finished.
  if (await isUserFinished(userResponse)) {
    return 'compile_prompt';
  }

  // If there are still pre-defined questions, ask the next one.
  if (questions && questions.length > 0) {
    return 'ask_question';
  }

  // If no more questions, ask the user for confirmation to proceed.
  return 'get_confirmation';
};
