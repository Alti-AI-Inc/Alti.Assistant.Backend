
import axios from 'axios';

const searchSECFillings = async (ticker) => {
  try {
    // SEC requires a custom User-Agent in the format: "Sample Company Name AdminContact@<sample company domain>.com"
    const headers = { 'User-Agent': 'AltiAI admin@alti.ai' };
    
    // Step 1: Get CIK from ticker
    const tickersRes = await axios.get('https://www.sec.gov/files/company_tickers.json', { headers });
    let cikStr = '';
    let title = '';
    for (const key in tickersRes.data) {
      if (tickersRes.data[key].ticker === ticker.toUpperCase()) {
        cikStr = String(tickersRes.data[key].cik_str).padStart(10, '0');
        title = tickersRes.data[key].title;
        break;
      }
    }
    
    if (!cikStr) return { error: 'Ticker not found' };

    // Step 2: Get Submissions
    const subRes = await axios.get(`https://data.sec.gov/submissions/CIK${cikStr}.json`, { headers });
    
    return {
      ticker: ticker.toUpperCase(),
      title,
      cik: cikStr,
      recentFilings: subRes.data.filings.recent,
    };
  } catch (error) {
    console.error('SEC API Error:', error.message);
    throw new Error('Failed to fetch SEC data');
  }
};

export { searchSECFillings };
