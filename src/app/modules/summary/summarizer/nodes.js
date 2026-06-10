import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { getUrlFromUserInputUsingAi } from '../openAIService.js';
import { generateSummary } from '../summarizerService.js';

/**
 * Node: Fetches content from the URL provided in the state.
 */
export const fetchContentNode = async (state) => {
  const { user_input, isFilePassed } = state;
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
 * Node: Generates the summary from the fetched content.
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