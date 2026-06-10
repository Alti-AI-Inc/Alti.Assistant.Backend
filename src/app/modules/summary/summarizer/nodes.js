import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { getUrlFromUserInputUsingAi } from '../openAIService.js';
import { generateSummary } from '../summarizerService.js';

/**
 * @typedef {object} UrlInfo
 * @property {string|null} url - The extracted URL, or null if not found or an error occurred.
 * @property {boolean} isYoutubeUrl - True if the URL is a YouTube link, false otherwise.
 * @property {string} [error] - An error message if parsing failed.
 */

/**
 * @typedef {object} WorkflowState
 * @property {string} user_input - The initial input provided by the user.
 * @property {boolean} [isFilePassed=false] - Indicates if the input was from a file, in which case AI URL extraction might be skipped.
 * @property {string} [content] - The fetched content from a URL or user input, used for summarization.
 * @property {Array<object>} [history] - Conversation history, potentially used by the summarization service.
 * @property {string} [summary] - The generated summary of the content.
 * @property {string} [error] - An error message if any step in the workflow failed.
 */

/**
 * Node: Fetches content from a URL provided in the state's `user_input` or directly uses `user_input` as content.
 * It first attempts to extract a URL from the user input using an AI service, then fetches content
 * using appropriate loaders (Cheerio for web pages, YoutubeLoader for YouTube videos).
 *
 * @param {WorkflowState} state - The current state object containing `user_input` and `isFilePassed`.
 * @returns {Promise<object>} A promise that resolves to an object containing:
 *   - `{ content: string }` if content was successfully fetched or derived from user input.
 *   - `{ error: string }` if an error occurred during URL extraction, content fetching, or validation.
 */
export const fetchContentNode = async (state) => {
  const { user_input, isFilePassed } = state;
  /** @type {UrlInfo} */
  let urlInfo = { url: null, isYoutubeUrl: false };
  let fetchError = null; // To capture errors from AI processing before content fetching

  if (!isFilePassed) {
    try {
      const rawUrlInfo = await getUrlFromUserInputUsingAi(user_input);
      urlInfo = convertRawJsonToJson(rawUrlInfo);
      if (urlInfo.error) { // Check if convertRawJsonToJson returned an error
        fetchError = urlInfo.error;
      }
    } catch (error) {
      console.error(`Error getting URL from AI: ${error.message}`);
      fetchError = `Failed to process user input for URL: ${error.message}`;
    }
  }

  if (fetchError) {
    // If an error occurred during URL extraction or parsing, return it immediately.
    return { error: fetchError };
  }

  console.log(
    `--- Node: fetchContentNode for URL: ${JSON.stringify(urlInfo)} ---`
  );
  const { url, isYoutubeUrl } = urlInfo;

  try {
    if (url) {
      // Basic URL validation for SSRF mitigation.
      // Ensures the URL uses http or https protocols.
      // Note: A more robust SSRF mitigation would involve resolving the IP address
      // and checking against private IP ranges, which is beyond a simple URL parsing check.
      // This basic check prevents direct use of non-web protocols or obvious private IP addresses
      // if they were directly in the URL hostname.
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid URL protocol. Only http and https are allowed.');
      }

      if (!isYoutubeUrl) {
        // If the URL is not a YouTube link, fetch the content using CheerioWebBaseLoader.
        const loader = new CheerioWebBaseLoader(url);
        const docs = await loader.load();
        if (docs.length === 0) {
          throw new Error('No content found at the provided URL.');
        }
        // Join all text content from the documents into a single string.
        const content = docs.map((doc) => doc.pageContent).join('\n');
        return { content };
      } else { // url && isYoutubeUrl
        // If the URL is a YouTube link, fetch the transcript.
        const loader = YoutubeLoader.createFromUrl(url, {
          language: 'en',
          addVideoInfo: true,
        });

        const docs = await loader.load();

        console.log(docs);
        if (docs.length === 0) {
          throw new Error('No content found at the provided URL.');
        }
        // Join all text content from the documents into a single string.
        const content = docs.map((doc) => doc.pageContent).join('\n');
        return { content };
      }
    } else {
      // If url is null (e.g., AI couldn't extract a URL or isFilePassed is true),
      // use user_input as content. This is a fallback, assuming user_input might
      // be the content itself if no URL was found or if a file was passed.
      return { content: user_input };
    }
  } catch (error) {
    console.error(`Error in fetchContentNode: ${error.message}`);
    // Return a structured error object for consistent error handling downstream.
    return { error: `Failed to fetch content: ${error.message}. Please check the link.` };
  }
};

/**
 * Converts a raw JSON string, potentially wrapped in markdown backticks (e.g., "```json\n{...}\n```"),
 * into a JavaScript object. This is typically used to parse AI model outputs.
 *
 * @param {string} rawJson - The raw string containing the JSON, possibly with markdown formatting.
 * @returns {UrlInfo} An object containing the parsed URL information:
 *   - `url`: The extracted URL string, or `null` if parsing failed.
 *   - `isYoutubeUrl`: A boolean indicating if the URL is a YouTube link, or `false` if parsing failed.
 *   - `error`: An error message string if parsing failed, otherwise undefined.
 */
export const convertRawJsonToJson = (rawJson) => {
  try {
    console.log('--- Converting raw JSON to object ---', rawJson);

    // 1. Clean the string to remove the markdown backticks and "json" label.
    // Note: This cleaning logic assumes a specific format from the AI output.
    // It might be brittle if the AI's output format varies significantly.
    const jsonString = rawJson
      .replace('```json', '') // Remove the starting part
      .replace('```', '') // Remove the ending part
      .trim(); // Remove any leading/trailing whitespace
    console.log('Cleaned JSON string:', jsonString);

    // 2. Parse the cleaned string into a JavaScript object.
    const jsonObject = JSON.parse(jsonString);

    // Now you can use it as a regular object
    console.log(jsonObject.url);
    // Expected output: "https://www.youtube.com/watch?v=-_6dHIPVoTM&ab_channel=Fireship"

    console.log(jsonObject.isYoutubeUrl);
    // Expected output: true
    return jsonObject;
  } catch (error) {
    console.error('Error converting raw JSON to object:', error);
    // Return an object with an error message and default values
    // to prevent downstream errors and provide structured error info.
    return { url: null, isYoutubeUrl: false, error: `Failed to parse AI response: ${error.message}` };
  }
};

/**
 * Node: Generates a summary from the fetched content using an external summarization service.
 * It expects `content` to be present in the state and can handle errors passed from previous nodes.
 *
 * @param {WorkflowState} state - The current state object containing `content`, `history`, and potentially `error`.
 * @returns {Promise<object>} A promise that resolves to an object containing:
 *   - `{ summary: string }` if the summary was successfully generated.
 *   - `{ error: string }` if an error occurred during summarization or if content was missing.
 */
export const summarizeContentNode = async (state) => {
  console.log('--- Node: summarizeContentNode ---');
  // Destructure content, history, and any error from the previous node's state.
  const { content, history, error: previousError } = state;

  // If the previous node returned an error, pass it along as the summary.
  if (previousError) {
    return { error: previousError };
  }

  // If content is unexpectedly missing, return an error.
  if (!content) {
    return { error: 'No content available for summarization.' };
  }

  try {
    // Request a non-streaming response from the service.
    const summary = await generateSummary(content, history);
    return { summary };
  } catch (error) {
    console.error(`Error in summarizeContentNode: ${error.message}`);
    // Return a structured error object for consistent error handling.
    return { error: `Failed to generate summary: ${error.message}` };
  }
};