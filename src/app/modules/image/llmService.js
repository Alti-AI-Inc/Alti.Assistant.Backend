import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { llm } from './llm.js';

/**
 * Analyzes the user's initial prompt and generates clarifying questions.
 * @param {string} initialPrompt - The user's first input.
 * @returns {Promise<string[]>} - An array of questions.
 */
export const generateClarifyingQuestions = async (initialPrompt) => {
  const parser = new JsonOutputParser();
  const prompt = PromptTemplate.fromTemplate(
    `A user wants to generate an image. Their initial idea is: "{prompt}".
    
    Your task is to generate 3-5 relevant, clarifying questions to help build a more detailed image prompt.
    The questions should be open-ended and encourage descriptive answers.
    
    Return ONLY a JSON object with a single key "questions" which is an array of strings.
    Example: {{"questions": ["What is the primary subject?", "What style should the image be in (e.g., photorealistic, cartoon, watercolor)?", "What is the desired mood or atmosphere?"]}}
    
    {format_instructions}`
  );

  const chain = prompt.pipe(llm).pipe(parser);
  try {
    const result = await chain.invoke({
      prompt: initialPrompt,
      format_instructions: parser.getFormatInstructions(),
    });
    return result.questions || [];
  } catch (error) {
    console.error('Error generating clarifying questions:', error);
    return [
      'Can you describe the main subject of the image?',
      'What art style are you imagining (e.g., photorealistic, anime, abstract)?',
      'What is the overall mood or feeling you want to convey?',
    ];
  }
};

/**
 * Analyzes the user's response to see if they are finished providing details.
 * @param {string} userResponse - The latest message from the user.
 * @returns {Promise<boolean>} - True if the user is finished, false otherwise.
 */
export const isUserFinished = async (userResponse) => {
  if (!userResponse) return false;
  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for the image.
        The user has been answering clarifying questions.
        If the user's message indicates they are done, satisfied, or want to proceed, respond with "YES".
        Examples of finished responses: "that's it", "I'm done", "go ahead and create it", "yes, that's all", "no more questions", "I'm finished", "i am okay".
        If the user is providing more details or answering a question, respond with "NO".

        User response: "{response}"
        
        Your answer (must be YES or NO):`
  );
  const chain = prompt.pipe(llm);
  const result = await chain.invoke({ response: userResponse });
  console.log('User finished analysis result:', result);

  return result.content.toUpperCase().includes('YES');
};

/**
 * **NEW**: Updates the image prompt with new details from the user. This is the core of the memory.
 * @param {string} currentPrompt - The current version of the detailed prompt.
 * @param {string} userResponse - The new information from the user.
 * @param {Array<{type: string, message: string}>} history - The conversation history for context.
 * @returns {Promise<string>} - The new, updated prompt.
 */
export const updateRefinedPrompt = async (
  currentPrompt,
  userResponse,
  history
) => {
  const historyString = history
    .map((h) => `${h.type}: ${h.message}`)
    .join('\n');
  const prompt = PromptTemplate.fromTemplate(
    `You are an AI assistant helping a user create a detailed image prompt.
    The user's current idea for the prompt is:
    ---
    {current_prompt}
    ---

    The user has just provided the following new information or answer:
    ---
    {user_response}
    ---

    Based on this new information, update and refine the image prompt.
    Integrate the new details smoothly into the existing prompt. If the new information contradicts something, use your best judgment to resolve it or incorporate the latest user preference.
    The goal is to build a single, cohesive, and detailed paragraph.

    Full Conversation History (for context):
    {history}

    Return ONLY the new, updated prompt paragraph. Do not add any conversational text around it.`
  );
  const chain = prompt.pipe(llm);
  const result = await chain.invoke({
    current_prompt: currentPrompt,
    user_response: userResponse,
    history: historyString,
  });
  return result.content;
};

/**
 * Compiles all gathered details into a final, rich prompt for image generation.
 * @param {string} finalRefinedPrompt - The final version of the refined prompt.
 * @returns {Promise<string>} - The final, detailed prompt.
 */
export const compileFinalPrompt = async (finalRefinedPrompt) => {
  // The refined prompt is already well-structured, so we can often use it directly.
  // This function can be used for a final polish if needed.
  return finalRefinedPrompt;
};

export const getUrlFromUserInputUsingAi = async (userInput) => {
  const prompt = PromptTemplate.fromTemplate(
    `You are an AI assistant helping a user find a URL to summarize.
    The user has provided the following input:
    "{user_input}"

    Your task is to extract the most relevant URL from this input. And check if it is a YouTube URL.
    If the input contains a valid URL, return it in the format:
    {{"url": "https://example.com", "isYoutubeUrl": true/false}}
    If the input does not contain a valid URL, only return:
    {{"url": null, "isYoutubeUrl": false}}
    If the input is a YouTube URL, set "isYoutubeUrl" to true.
    `
  );
  const chain = prompt.pipe(llm);
  const result = await chain.invoke({ user_input: userInput });
  return result.content;
};
