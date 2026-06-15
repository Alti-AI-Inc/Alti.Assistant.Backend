import { isUserFinished } from '../llm.js';
import {
  generateWritingQuestions,
  updateWritingBrief,
  generateFinalContent,
} from '../service/writingService.js';
import {
  startWritingLimiter,
  writingInteractionLimiter,
  finalContentLimiter,
} from '../middleware/rateLimiter.js'; // Enterprise-grade Redis-backed rate limiters for DDOS/abuse protection.

export const analyzeTopicNode = async (state) => {
  const { initialTopic, userId } = state; // userId is essential for rate-limiting.

  // [DDOS Guard]: Protects the expensive initial topic analysis LLM call.
  // Limits how many new writing projects a user can start in a given time frame.
  await startWritingLimiter.consume(userId);

  const questions = await generateWritingQuestions(initialTopic);
  const firstQuestion = questions.shift();
  return {
    writingBrief: `Topic: ${initialTopic}`,
    questions,
    responseMessage: firstQuestion,
    history: [{ role: 'ai', content: firstQuestion }],
  };
};

export const processResponseNode = async (state) => {
  const { writingBrief, userInput, history, userId } = state;

  // [DDOS Guard]: Protects the conversational brief-updating LLM call.
  // Prevents rapid-fire messages and API abuse during the brief refinement phase.
  await writingInteractionLimiter.consume(userId);

  const updatedBrief = await updateWritingBrief(
    writingBrief,
    userInput,
    history
  );
  return {
    writingBrief: updatedBrief,
    history: [{ role: 'user', content: userInput }],
  };
};

export const askQuestionNode = async (state) => {
  // This node is cheap (array shift) and part of a controlled flow, no specific rate limit needed here.
  const { questions } = state;
  const nextQuestion = questions.shift();
  return {
    questions,
    responseMessage: nextQuestion,
    history: [{ role: 'ai', content: nextQuestion }],
  };
};

export const getConfirmationNode = async (state) => {
  // This node is cheap (static message), no rate limit needed.
  const message = 'I have a detailed brief now. Shall I start writing?';
  return {
    responseMessage: message,
    history: [{ role: 'ai', content: message }],
  };
};

export const writeContentNode = async (state) => {
  console.log('--- Node: writeContentNode ---', state);
  const { initialTopic, userInput, userId } = state;

  // [DDOS Guard]: Critical. Protects the most expensive final content generation endpoint.
  // Strictly limits how many full articles a user can generate to prevent cost runaway.
  await finalContentLimiter.consume(userId);

  const stream = await generateFinalContent(initialTopic, userInput, true);
  return { finalContent: stream };
};

export const routeInitial = (state) => {
  // This is a cheap, synchronous routing function, no rate limit needed.
  return state.history.length === 0 ? 'analyze_topic' : 'process_response';
};

export const routeNextStep = async (state) => {
  const { userInput, questions, userId } = state;

  // [DDOS Guard]: Protects the intent-classification LLM call (isUserFinished).
  // This is part of the conversational flow and is protected by the interaction limiter.
  await writingInteractionLimiter.consume(userId);

  if (await isUserFinished(userInput)) return 'write_content';
  if (questions && questions.length > 0) return 'ask_question';
  return 'get_confirmation';
};