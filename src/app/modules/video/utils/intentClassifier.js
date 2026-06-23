import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { createLlmInstance } from '../llm.js';

const llm = createLlmInstance();

export const VIDEO_INTENTS = {
  VIDEO_GENERATION: 'VIDEO_GENERATION', // Text-to-Video
  IMAGE_TO_VIDEO: 'IMAGE_TO_VIDEO',     // Image-to-Video
  VIDEO_ANALYSIS: 'VIDEO_ANALYSIS',     // Video Understanding/Analysis
  STORYBOARDING: 'STORYBOARDING',       // Script/Storyboard planning
  UNKNOWN: 'UNKNOWN'
};

/**
 * Classifies the user's video-related intent to route to the correct model and flow.
 *
 * @param {string} prompt - The user's input prompt
 * @param {Array} history - The conversation history
 * @returns {Promise<string>} The classified intent
 */
export const classifyVideoIntent = async (prompt, history = []) => {
  const parser = new JsonOutputParser();
  const template = PromptTemplate.fromTemplate(
    `You are an intent classifier for a Video Studio application.
    Analyze the user's prompt and conversation history to determine their goal.
    
    Categories:
    - VIDEO_GENERATION: The user wants to generate a new video from a text description (e.g., "Make a cinematic video of a flying car").
    - IMAGE_TO_VIDEO: The user wants to animate or create a video starting from a specific image they provided or referenced.
    - VIDEO_ANALYSIS: The user wants to analyze, transcribe, or understand an existing video (e.g., "What is happening in this video?", "Extract the transcript").
    - STORYBOARDING: The user wants help writing a script, planning a storyboard, or directing a scene before generating the final video.
    - UNKNOWN: The intent is not clear or doesn't match the above.
    
    User Prompt: "{prompt}"
    Recent History: {history}
    
    Return ONLY a JSON object with the key "intent" and the matched category as a string.
    
    {format_instructions}`
  );

  const chain = template.pipe(llm).pipe(parser);
  try {
    const result = await chain.invoke({
      prompt: prompt.trim(),
      history: JSON.stringify(history.slice(-3)),
      format_instructions: parser.getFormatInstructions(),
    });
    return result?.intent || VIDEO_INTENTS.UNKNOWN;
  } catch (error) {
    console.error('Error classifying video intent:', error);
    return VIDEO_INTENTS.VIDEO_GENERATION; // Default fallback
  }
};
