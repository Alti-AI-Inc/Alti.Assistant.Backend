export const fetchSearchResults = async query => {
  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query },
      {
        headers: {
          'X-API-KEY': config.serper_api_key,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data?.organic?.slice(0, 3) || []; // Limit to top 3 results
  } catch (error) {
    console.error('Serper API Error:', error.message);
    return [];
  }
};
