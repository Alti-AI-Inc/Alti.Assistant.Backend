// Imports for Express server and graceful shutdown
import express from 'express';
import http from 'http';

// Original business logic imports
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

// --- Express Server Setup & Cloud Run Lifecycle ---

// A variable to track the server's readiness state.
let isServerReady = true;

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

/**
 * Liveness probe endpoint (/healthz).
 * Cloud Run uses this to check if the container's server process is running.
 * A 200 OK response indicates the server is alive.
 */
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

/**
 * Readiness probe endpoint (/readyz).
 * Cloud Run uses this to check if the container is ready to accept traffic.
 * Once shutdown begins, this will report the server as not ready.
 * In a real application, you would also check for database connections or other dependencies.
 */
app.get('/readyz', (req, res) => {
  if (isServerReady) {
    // TODO: Add checks for essential dependencies (e.g., database connection).
    // If a dependency is down, return 503.
    res.status(200).send('ok');
  } else {
    res.status(503).send('Service Unavailable: Server is shutting down.');
  }
});

// Use the PORT environment variable provided by Cloud Run.
const PORT = process.env.PORT || 8080;

// Create an HTTP server to have more control over the shutdown process.
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// --- Graceful Shutdown Logic ---

const gracefulShutdown = () => {
  console.log('Received signal to terminate: closing HTTP server.');

  // Signal that the server is no longer ready to accept new traffic for the readiness probe.
  isServerReady = false;

  // Stop the server from accepting new connections and wait for existing ones to finish.
  // Cloud Run gives a 10-second grace period by default before sending SIGKILL.
  server.close(() => {
    console.log('HTTP server closed.');
    // Here you would close any database connections or other resources.
    // For example: await database.close();
    process.exit(0);
  });

  // If server.close() is taking too long, force a shutdown after a timeout.
  // This is a failsafe to ensure the process exits before Cloud Run sends SIGKILL.
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 9500); // 9.5 seconds, slightly less than the default 10s Cloud Run grace period
};

// Listen for the termination signal from Cloud Run.
process.on('SIGTERM', gracefulShutdown);
// Also handle Ctrl+C for local development.
process.on('SIGINT', gracefulShutdown);