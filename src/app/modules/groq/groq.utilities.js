import { GoogleSearchGroundingTool } from '../deep_research/utils/google-search-grounding.js';

export const fetchSearchResults = async (query) => {
  try {
    // Instantiate the tool inside the try block to catch potential errors during its construction
    const searchTool = new GoogleSearchGroundingTool({ maxResults: 3 });
    const response = await searchTool.invoke({ query, includeAnswer: false });
    return (response.results || []).map(r => ({
      title: r.title,
      link: r.url,
      snippet: r.content
    }));
  } catch (error) {
    console.error('Google Search Grounding Error in Groq utility:', error.message);
    return [];
  }
};