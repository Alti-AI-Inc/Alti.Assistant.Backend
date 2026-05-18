import {
  generateVideoClarifyingQuestions,
  isUserFinishedVideo,
  updateVideoRefinedPrompt,
  compileVideoFinalPrompt,
} from '../videoGenerationService.js';
import { generateVideo, generateVideoWithVertexAI } from '../videoService.js';

/**
 * Node: Starts the video conversation by analyzing the initial prompt and asking the first question.
 */
export const analyzeInitialVideoPromptNode = async (state) => {
  console.log('--- Node: analyzeInitialVideoPromptNode ---', state);
  const { initialPrompt } = state;
  const questions = await generateVideoClarifyingQuestions(initialPrompt);
  const firstQuestion = questions.shift(); // Get the first question

  return {
    refinedPrompt: initialPrompt, // Start refining from the initial idea
    questions: questions, // Store the rest of the questions
    responseMessage: firstQuestion,
    conversationHistory: [{ type: 'ai', message: firstQuestion }],
  };
};

/**
 * Node: Processes the user's response, updating the video prompt with new details (the "memory" step).
 */
export const processVideoUserResponseNode = async (state) => {
  console.log('--- Node: processVideoUserResponseNode ---');
  const { refinedPrompt, userResponse, conversationHistory } = state;

  const updatedPrompt = await updateVideoRefinedPrompt(
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
 * Node: Asks the next video-related question from the list.
 */
export const askVideoQuestionNode = async (state) => {
  console.log('--- Node: askVideoQuestionNode ---');
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
export const getVideoConfirmationNode = async (state) => {
  console.log('--- Node: getVideoConfirmationNode ---');
  const message =
    "I think I have a good amount of detail now. Should I proceed with generating the video, or is there anything else you'd like to add?";
  return {
    responseMessage: message,
    conversationHistory: [{ type: 'ai', message }],
  };
};

/**
 * Node: Compiles the final prompt for the video generator.
 */
export const compileVideoFinalPromptNode = async (state) => {
  console.log('--- Node: compileVideoFinalPromptNode ---');
  const { refinedPrompt } = state;
  const finalPrompt = await compileVideoFinalPrompt(refinedPrompt);
  const message =
    "Great! I've created a detailed prompt based on our conversation. Now generating your video, this may take a few minutes...";
  return {
    finalPrompt,
    responseMessage: message,
    conversationHistory: [{ type: 'ai', message }],
    generationStatus: 'started',
  };
};

/**
 * Node: Calls the video generation service.
 */
export const generateVideoNode = async (state) => {
  console.log('--- Node: generateVideoNode ---');
  const { finalPrompt, videoDuration, videoStyle, videoResolution } = state;
  console.log('Generating video with prompt:', {
    finalPrompt,
    videoDuration,
    videoStyle,
    videoResolution,
  });

  try {
    const videoResult = await generateVideoWithVertexAI({
      prompt: finalPrompt,
      duration: videoDuration || 5, // Default 5 seconds
      style: videoStyle || 'realistic',
      resolution: videoResolution || '1024x576',
    });

    if (!videoResult) {
      return {
        responseMessage:
          'Sorry, I encountered an error while generating the video. Please try again.',
        generationStatus: 'failed',
      };
    }

    return {
      videoUrl: videoResult,
      responseMessage:
        "Here is your generated video! Let me know if you'd like to create another one.",
      generationStatus: 'completed',
      generationProgress: 100,
    };
  } catch (error) {
    console.error('Video generation error:', error);
    return {
      responseMessage:
        'Sorry, I encountered an error while generating the video. Please try again.',
      generationStatus: 'failed',
    };
  }
};

// --- Routers ---

/**
 * Router: Determines the initial path of the video conversation (first message vs. subsequent messages).
 */
export const routeVideoInitial = (state) => {
  console.log('--- Router: routeVideoInitial ---');
  // If conversationHistory is empty, it's the first message.
  console.log(
    'Video Conversation History Length:',
    state.conversationHistory?.length || 0
  );

  if (!state.conversationHistory || state.conversationHistory.length === 0) {
    return 'analyze_video_prompt';
  }
  // Otherwise, it's a subsequent message in the conversation.
  return 'process_video_response';
};

/**
 * Router: After processing a user's response, decides the next action.
 */
export const routeVideoNextStep = async (state) => {
  console.log('--- Router: routeVideoNextStep ---');
  const { questions, userResponse } = state;

  // First, check if the user has explicitly said they are finished.
  if (await isUserFinishedVideo(userResponse)) {
    return 'compile_video_prompt';
  }

  // If there are still pre-defined questions, ask the next one.
  if (questions && questions.length > 0) {
    return 'ask_video_question';
  }

  // If no more questions, ask the user for confirmation to proceed.
  return 'get_video_confirmation';
};
