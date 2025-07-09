import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { YoutubeTranscript } from 'youtube-transcript';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { getUrlFromUserInputUsingAi } from '../openAIService.js';
import { generateSummary } from '../summarizerService.js';

/**
 * Node: Fetches content from the URL provided in the state.
 */
export const fetchContentNode = async (state) => {
  const { user_input } = state;
  const urlInfo = convertRawJsonToJson(
    await getUrlFromUserInputUsingAi(user_input)
  );
  console.log(
    `--- Node: fetchContentNode for URL: ${JSON.stringify(urlInfo)} ---`
  );
  const { url, isYoutubeUrl } = urlInfo;
  try {
    if (url && !isYoutubeUrl) {
      // If the URL is not a YouTube link, fetch the content using CheerioWebBaseLoader.
      const loader = new CheerioWebBaseLoader(url);
      const docs = await loader.load();
      if (docs.length === 0) {
        throw new Error('No content found at the provided URL.');
      }
      // Join all text content from the documents into a single string.
      const content = docs.map((doc) => doc.pageContent).join('\n');
      return { content };
    } else if (url && isYoutubeUrl) {
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
    } else {
      return {
        content: user_input,
      };
    }
  } catch (error) {
    console.error(`Error in fetchContentNode: ${error.message}`);
    // Return an error message in the content field to be handled downstream.
    return {
      content: `Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.`,
    };
  }
};

export const convertRawJsonToJson = (rawJson) => {
  try {
    console.log('--- Converting raw JSON to object ---', rawJson);

    // 1. Clean the string to remove the markdown backticks and "json" label.
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
    // Return an empty object or handle the error as needed
    return {};
  }
};

/**
 * Node: Generates the summary from the fetched content.
 */
export const summarizeContentNode = async (state) => {
  console.log('--- Node: summarizeContentNode ---');
  const { content, history } = state;

  // If the previous node returned an error, pass it along as the summary.
  if (content.startsWith('Error:')) {
    return { summary: content };
  }

  // Request a stream from the service.
  const stream = await generateSummary(content, history, true);

  return { summary: stream };
};
/**
 * Node: Get the url from the user input
 */
async function fetchYouTubeTranscript(url) {
  try {
    console.log(`Fetching transcript for YouTube URL: ${url}`);
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript found for this video.');
    }
    // Join all the text parts of the transcript into a single string.
    return transcript.map((item) => item.text).join(' ');
  } catch (error) {
    console.error(`Error fetching YouTube transcript: ${error.message}`);
    // Return a user-friendly error message.
    return `Error: Could not get a transcript for this video. It might be private, have transcripts disabled, or be a live stream.`;
  }
}
