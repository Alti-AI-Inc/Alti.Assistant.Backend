import { isUserFinished } from '../llm.js';
import {
  generateWritingQuestions,
  updateWritingBrief,
  generateFinalContent,
} from '../service/writingService.js';

export const analyzeTopicNode = async (state) => {
  const { initialTopic } = state;
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
  const { writingBrief, userInput, history } = state;
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
  const { questions } = state;
  const nextQuestion = questions.shift();
  return {
    questions,
    responseMessage: nextQuestion,
    history: [{ role: 'ai', content: nextQuestion }],
  };
};

export const getConfirmationNode = async (state) => {
  const message = 'I have a detailed brief now. Shall I start writing?';
  return {
    responseMessage: message,
    history: [{ role: 'ai', content: message }],
  };
};

export const writeContentNode = async (state) => {
  console.log('--- Node: writeContentNode ---', state);
  const { initialTopic, userInput } = state;
  const stream = await generateFinalContent(initialTopic, userInput, true);
  return { finalContent: stream };
};

export const routeInitial = (state) => {
  return state.history.length === 0 ? 'analyze_topic' : 'process_response';
};

export const routeNextStep = async (state) => {
  if (await isUserFinished(state.userInput)) return 'write_content';
  if (state.questions && state.questions.length > 0) return 'ask_question';
  return 'get_confirmation';
};
