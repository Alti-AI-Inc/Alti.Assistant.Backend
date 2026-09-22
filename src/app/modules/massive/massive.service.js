import axios from 'axios';
import config from '../../../../config/index.js';
import { MassiveWebSocket } from './massive.websocket.js';

const massiveApi = axios.create({
  baseURL: 'https://api.massive.com/v1',
  headers: {
    'Authorization': `Bearer ${config.massive?.apiKey || process.env.MASSIVE_API_KEY || 'demo-massive-key'}`,
    'Content-Type': 'application/json'
  }
});

export const MassiveService = {
  /**
   * Get latest tick from memory (WS stream)
   */
  getRealtimeTick(assetClass, ticker) {
    return MassiveWebSocket.getLatestData(assetClass, ticker);
  },
  
  /**
   * Subscribe WebSocket to specific tickers dynamically
   */
  subscribeRealtime(assetClass, tickers) {
    MassiveWebSocket.subscribe(assetClass, tickers);
    return { success: true, message: `Subscribed to ${tickers.join(', ')} on ${assetClass}` };
  },

  /**
   * Fetch historical daily aggregates for an asset
   */
  async getHistoricalAggregates(assetClass, ticker, fromDate, toDate, timespan = 'day') {
    const response = await massiveApi.get(`/${assetClass}/aggs/ticker/${ticker}/range/1/${timespan}/${fromDate}/${toDate}`);
    return response.data;
  },

  /**
   * Get detailed reference data for a ticker
   */
  async getTickerDetails(assetClass, ticker) {
    const response = await massiveApi.get(`/${assetClass}/reference/tickers/${ticker}`);
    return response.data;
  },
  
  /**
   * Fetch market status
   */
  async getMarketStatus() {
    const response = await massiveApi.get(`/marketstatus/now`);
    return response.data;
  }
};

export default MassiveService;
