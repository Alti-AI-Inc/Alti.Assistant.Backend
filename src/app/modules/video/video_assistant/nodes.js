// Original business logic imports
import {
  generateVideoClarifyingQuestions,
  isUserFinishedVideo,
  updateVideoRefinedPrompt,
  compileVideoFinalPrompt,
} from '../videoGenerationService.js';
import { generateVideoWithVertexAI } from '../videoService.js';

// --- Platform Integration Imports for User Management, Limits, and Storage ---
// These are placeholder services. In a real application, they would interact with your database.
import {
  canUserGenerateVideo,
  decrementUserVideoCredits,
} from '../../user/userService.js'; // Assumed path
import { saveUserVideo } from '../../files/fileService.js'; // Assumed path

// --- Constants ---
const DEFAULT_VIDEO_DURATION = 5; // seconds
const DEFAULT_VIDEO_STYLE = 'realistic';
const DEFAULT_VIDEO_RESOLUTION = '1024x576'; // Standard plan resolution
const PRO_VIDEO_RESOLUTION = '1920x1080'; // Pro plan resolution

/**
 * Node: Starts the video conversation by analyzing the initial prompt and asking the first question.
 * Ensures user data is properly scoped from the beginning.
 * @param {object} state - The current state of the graph. Must include `initialPrompt` and `userId`.
 * @returns {object} The updated state.
 */
export const analyzeInitialVideoPromptNode = async (state) => {
  console.log('--- Node: analyzeInitialVideoPromptNode ---', { userId: state.userId });
  const { initialPrompt, userId } = state;

  // Ensure userId is present for all subsequent operations. This is a critical security and data isolation check.
  if (!userId) {
    console.error('CRITICAL: userId is missing from the state in analyzeInitialVideoPromptNode.');
    return {
      responseMessage: 'An authentication error occurred. Please try logging in again.',
      // This should terminate the graph execution.
      // Depending on the graph runner, you might throw an error or return a specific state.
      conversationHistory: [],
      generationStatus: 'failed',
    };
  }

  try {
    const questions = await generateVideoClarifyingQuestions(initialPrompt);
    const firstQuestion = questions.shift(); // Get the first question

    return {
      refinedPrompt: initialPrompt, // Start refining from the initial idea
      questions: questions, // Store the rest of the questions
      responseMessage: firstQuestion,
      conversationHistory: [{ type: 'ai', message: firstQuestion }],
    };
  } catch (error) {
    console.error(`Error generating clarifying questions for user ${userId}:`, error);
    return {
      responseMessage: "I'm having trouble understanding that. Could you please rephrase your idea?",
      conversationHistory: [{ type: 'ai', message: "I'm having trouble understanding that. Could you please rephrase your idea?" }],
      generationStatus: 'failed', // Mark as failed to prevent continuation
    };
  }
};

/**
 * Node: Processes the user's response, updating the video prompt with new details (the "memory" step).
 * @param {object} state - The current state of the graph.
 * @returns {object} The updated state with the refined prompt.
 */
export const processVideoUserResponseNode = async (state) => {
  console.log('--- Node: processVideoUserResponseNode ---', { userId: state.userId });
  const { refinedPrompt, userResponse, conversationHistory } = state;

  try {
    const updatedPrompt = await updateVideoRefinedPrompt(
      refinedPrompt,
      userResponse,
      conversationHistory
    );

    return {
      refinedPrompt: updatedPrompt,
      conversationHistory: [{ type: 'user', message: userResponse }],
    };
  } catch (error) {
    console.error(`Error updating refined prompt for user ${state.userId}:`, error);
    return {
      responseMessage: "Sorry, I had an issue processing that response. Let's try again. What would you like to add?",
      conversationHistory: [{ type: 'ai', message: "Sorry, I had an issue processing that response. Let's try again. What would you like to add?" }],
      // We don't fail the whole generation, just ask the user to rephrase or continue.
    };
  }
};

/**
 * Node: Asks the next video-related question from the list.
 * @param {object} state - The current state of the graph.
 * @returns {object} The updated state with the next question.
 */
export const askVideoQuestionNode = async (state) => {
  console.log('--- Node: askVideoQuestionNode ---', { userId: state.userId });
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
 * @param {object} state - The current state of the graph.
 * @returns {object} The updated state with a confirmation message.
 */
export const getVideoConfirmationNode = async (state) => {
  console.log('--- Node: getVideoConfirmationNode ---', { userId: state.userId });
  const message =
    "I think I have a good amount of detail now. Should I proceed with generating the video, or is there anything else you'd like to add?";
  return {
    responseMessage: message,
    conversationHistory: [{ type: 'ai', message }],
  };
};

/**
 * Node: Checks if the user has sufficient credits or meets the plan requirements to generate a video.
 * This is a critical step to enforce user-level limits and prevent resource abuse.
 * @param {object} state - The current state of the graph. Must include `userId`.
 * @returns {object} The updated state, including a `canGenerate` flag.
 */
export const checkUserLimitsNode = async (state) => {
  console.log('--- Node: checkUserLimitsNode ---', { userId: state.userId });
  const { userId } = state;

  const checkResult = await canUserGenerateVideo(userId);

  if (!checkResult.canGenerate) {
    console.log(`User ${userId} has reached their video generation limit. Reason: ${checkResult.reason}`);
    return {
      canGenerate: false,
      responseMessage: checkResult.reason || "You've reached your video generation limit for this month. Please upgrade your plan to continue creating.",
      generationStatus: 'limit_reached',
    };
  }

  console.log(`User ${userId} has sufficient credits. Proceeding.`);
  return {
    canGenerate: true,
    // Pass along user plan details for use in the generation node.
    userPlan: checkResult.plan,
  };
};


/**
 * Node: Compiles the final prompt for the video generator.
 * @param {object} state - The current state of the graph.
 * @returns {object} The updated state with the final prompt.
 */
export const compileVideoFinalPromptNode = async (state) => {
  console.log('--- Node: compileVideoFinalPromptNode ---', { userId: state.userId });
  const { refinedPrompt } = state;
  try {
    const finalPrompt = await compileVideoFinalPrompt(refinedPrompt);
    const message =
      "Great! I've created a detailed prompt based on our conversation. Now generating your video, this may take a few minutes...";
    return {
      finalPrompt,
      responseMessage: message,
      conversationHistory: [{ type: 'ai', message }],
      generationStatus: 'started',
    };
  } catch (error) {
    console.error(`Error compiling final prompt for user ${state.userId}:`, error);
    return {
      responseMessage: "I'm sorry, I ran into an issue while preparing your video prompt. Could we try refining the details again?",
      generationStatus: 'failed',
    };
  }
};

/**
 * Node: Calls the video generation service, decrements user credits, and saves the result to the user's personal storage.
 * @param {object} state - The current state of the graph. Must include `userId` and `finalPrompt`.
 * @returns {object} The final state with the video URL or an error.
 */
export const generateVideoNode = async (state) => {
  console.log('--- Node: generateVideoNode ---', { userId: state.userId });
  const { finalPrompt, videoDuration, videoStyle, videoResolution, userId, userPlan } = state;

  // Example of plan-based features. This would be determined from user data.
  const resolution = userPlan === 'pro' ? PRO_VIDEO_RESOLUTION : DEFAULT_VIDEO_RESOLUTION;

  console.log('Generating video with parameters:', {
    userId,
    finalPrompt,
    videoDuration,
    videoStyle,
    resolution, // Use plan-based resolution
  });

  try {
    const videoResultUrl = await generateVideoWithVertexAI({
      prompt: finalPrompt,
      duration: videoDuration || DEFAULT_VIDEO_DURATION,
      style: videoStyle || DEFAULT_VIDEO_STYLE,
      resolution: videoResolution || resolution, // Allow override, but default to plan
    });

    if (!videoResultUrl) {
      // This case handles non-exception failures from the video service.
      throw new Error('Video generation service returned an empty result.');
    }

    // --- Usage Metrics and File Storage ---
    // These operations should be atomic or handled by a transactional job queue in a production system.
    await decrementUserVideoCredits(userId, 1); // Decrement credits after successful generation.
    await saveUserVideo(userId, {
      prompt: finalPrompt,
      url: videoResultUrl,
      duration: videoDuration || DEFAULT_VIDEO_DURATION,
      style: videoStyle || DEFAULT_VIDEO_STYLE,
      resolution: videoResolution || resolution,
      createdAt: new Date(),
    });

    return {
      videoUrl: videoResultUrl,
      responseMessage:
        "Here is your generated video! It has been saved to your personal library. Let me know if you'd like to create another one.",
      generationStatus: 'completed',
      generationProgress: 100,
    };
  } catch (error) {
    console.error(`Video generation error for user ${userId}:`, error);
    // Important: Do not decrement user credits on failure.
    return {
      responseMessage:
        'Sorry, I encountered an error while generating the video. Your credits have not been used. Please try again.',
      generationStatus: 'failed',
    };
  }
};

// --- Routers ---

/**
 * Router: Determines the initial path of the video conversation (first message vs. subsequent messages).
 * @param {object} state - The current state of the graph.
 * @returns {string} The name of the next node to execute.
 */
export const routeVideoInitial = (state) => {
  console.log('--- Router: routeVideoInitial ---');
  console.log(
    'Video Conversation History Length:',
    state.conversationHistory?.length || 0
  );

  if (!state.conversationHistory || state.conversationHistory.length === 0) {
    return 'analyze_video_prompt';
  }
  return 'process_video_response';
};

/**
 * Router: After processing a user's response, decides the next action.
 * @param {object} state - The current state of the graph.
 * @returns {string} The name of the next node to execute.
 */
export const routeVideoNextStep = async (state) => {
  console.log('--- Router: routeVideoNextStep ---');
  const { questions, userResponse } = state;

  // First, check if the user has explicitly said they are finished.
  if (await isUserFinishedVideo(userResponse)) {
    // Before compiling, check if the user can generate the video.
    return 'check_user_limits';
  }

  // If there are still pre-defined questions, ask the next one.
  if (questions && questions.length > 0) {
    return 'ask_video_question';
  }

  // If no more questions, ask the user for confirmation to proceed.
  return 'get_video_confirmation';
};

/**
 * Router: After checking user limits, decides whether to proceed with generation or stop.
 * @param {object} state - The current state of the graph. Must include `canGenerate`.
 * @returns {string} The name of the next node to execute, or '__END__' to terminate.
 */
export const routeAfterLimitsCheck = (state) => {
  console.log('--- Router: routeAfterLimitsCheck ---');
  if (state.canGenerate) {
    return 'compile_video_prompt';
  }
  // If the user cannot generate, the flow ends. The `checkUserLimitsNode` has already
  // set the final response message.
  return '__END__';
};