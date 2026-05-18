import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { llm } from './llm.js';

/**
 * Analyzes the user's initial prompt and generates clarifying questions for video generation.
 * @param {string} initialPrompt - The user's first input.
 * @returns {Promise<string[]>} - An array of questions.
 */
export const generateVideoClarifyingQuestions = async (initialPrompt) => {
  const parser = new JsonOutputParser();
  const prompt = PromptTemplate.fromTemplate(
    `A user wants to generate a video. Their initial idea is: "{prompt}".
    
    Your task is to generate 4-6 relevant, clarifying questions to help build a more detailed video prompt.
    The questions should be open-ended and encourage descriptive answers about video-specific elements.
    Focus on aspects like: visual style, duration, movement, pacing, mood, subjects, environment, camera angles, transitions, etc.
    
    Return ONLY a JSON object with a single key "questions" which is an array of strings.
    Example: {{"questions": ["What is the main subject or scene in your video?", "What visual style do you prefer (realistic, animated, cinematic)?", "How long should the video be?", "What kind of movement or action should happen?", "What's the desired mood or atmosphere?", "Should there be any specific camera movements or angles?"]}}
    
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
    console.error('Error generating video clarifying questions:', error);
    return [
      'What is the main subject or scene in your video?',
      'What visual style do you prefer (realistic, animated, cinematic, artistic)?',
      'How long should the video be (in seconds)?',
      'What kind of movement or action should happen in the video?',
      "What's the desired mood or atmosphere?",
      'Should there be any specific camera movements or angles?',
    ];
  }
};

/**
 * Analyzes the user's response to see if they are finished providing video details.
 * @param {string} userResponse - The latest message from the user.
 * @returns {Promise<boolean>} - True if the user is finished, false otherwise.
 */
export const isUserFinishedVideo = async (userResponse) => {
  if (!userResponse) return false;
  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for the video.
        The user has been answering clarifying questions about their video concept.
        
        User response: "{userResponse}"
        
        Look for phrases like:
        - "that's all", "I'm done", "proceed", "generate", "create", "go ahead"
        - "no more details", "that's everything", "sounds good"
        - "yes, generate it", "let's create it", "I'm ready"
        
        Return "true" if they seem finished, "false" if they want to provide more details.
        Return ONLY true or false, nothing else.`
  );

  try {
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
      userResponse: userResponse,
    });

    const cleanResult = result.content
      ? result.content.trim().toLowerCase()
      : result.trim().toLowerCase();
    return cleanResult === 'true';
  } catch (error) {
    console.error('Error checking if user is finished with video:', error);
    // If there's an error, assume they're not finished
    return false;
  }
};

/**
 * Updates the refined video prompt by incorporating the user's response.
 * @param {string} currentPrompt - The current refined prompt.
 * @param {string} userResponse - The user's latest response.
 * @param {Array} conversationHistory - The full conversation history.
 * @returns {Promise<string>} - The updated refined prompt.
 */
export const updateVideoRefinedPrompt = async (
  currentPrompt,
  userResponse,
  conversationHistory
) => {
  const prompt = PromptTemplate.fromTemplate(
    `You are helping to refine a video generation prompt. 
        
        Current prompt: "{currentPrompt}"
        User's latest response: "{userResponse}"
        Conversation history: {conversationHistory}
        
        Update the prompt by seamlessly incorporating the user's new information. 
        The result should be a cohesive, detailed description for video generation that includes:
        - Visual elements and style
        - Movement and action
        - Duration and pacing
        - Mood and atmosphere
        - Camera work if specified
        - Any technical specifications
        
        Return only the updated prompt, nothing else.`
  );

  try {
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
      currentPrompt: currentPrompt,
      userResponse: userResponse,
      conversationHistory: JSON.stringify(conversationHistory.slice(-6)), // Last 6 messages for context
    });

    return result.content || result;
  } catch (error) {
    console.error('Error updating video refined prompt:', error);
    // Fallback: simple concatenation
    return `${currentPrompt}. ${userResponse}`;
  }
};

/**
 * Compiles the final, optimized prompt for video generation.
 * @param {string} refinedPrompt - The refined prompt with all user feedback.
 * @returns {Promise<string>} - The final, optimized prompt.
 */
export const compileVideoFinalPrompt = async (refinedPrompt) => {
  const prompt = PromptTemplate.fromTemplate(
    `Take this refined video concept and create a final, optimized prompt for video generation:
        
        Refined concept: "{refinedPrompt}"
        
        Create a clear, detailed video generation prompt that includes:
        1. Main subject/scene description
        2. Visual style and aesthetics
        3. Movement and action details
        4. Duration and pacing
        5. Mood and atmosphere
        6. Camera work and composition
        7. Technical specifications (resolution, style)
        
        The prompt should be professional, specific, and optimized for AI video generation.
        Return only the final prompt, nothing else.`
  );

  try {
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
      refinedPrompt: refinedPrompt,
    });

    return result.content || result;
  } catch (error) {
    console.error('Error compiling final video prompt:', error);
    // Fallback: return the refined prompt as-is
    return refinedPrompt;
  }
};
