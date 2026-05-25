import axios from 'axios';
import { logger } from '../../../shared/logger.js';

/**
 * Decodes XML HTML entities and extracts CDATA blocks.
 */
const decodeXml = (str) => {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

/**
 * Regex-based lightweight XML parser to safely parse Google Trends RSS structure.
 */
const parseTrendsRss = (xmlText) => {
  const items = [];
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const approxTrafficMatch = itemXml.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i);
    const descriptionMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
    const pictureMatch = itemXml.match(/<ht:picture>([\s\S]*?)<\/ht:picture>/i);

    // Extract news item details
    const newsTitleMatch = itemXml.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/i);
    const newsSnippetMatch = itemXml.match(/<ht:news_item_snippet>([\s\S]*?)<\/ht:news_item_snippet>/i);
    const newsUrlMatch = itemXml.match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/i);
    const newsSourceMatch = itemXml.match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/i);

    const title = titleMatch ? decodeXml(titleMatch[1].trim()) : '';
    const approxTraffic = approxTrafficMatch ? approxTrafficMatch[1].trim() : '50,000+';
    const description = descriptionMatch ? decodeXml(descriptionMatch[1].trim()) : '';
    const picture = pictureMatch ? pictureMatch[1].trim() : '';

    const newsItem = newsTitleMatch ? {
      title: decodeXml(newsTitleMatch[1].trim()),
      snippet: newsSnippetMatch ? decodeXml(newsSnippetMatch[1].trim()) : '',
      url: newsUrlMatch ? newsUrlMatch[1].trim() : '',
      source: newsSourceMatch ? decodeXml(newsSourceMatch[1].trim()) : ''
    } : null;

    if (title) {
      items.push({
        query: title,
        approxTraffic,
        description,
        picture,
        newsItem
      });
    }
  }

  return items;
};

/**
 * Retrieves daily and real-time trending searches from Google Trends.
 * 
 * @param {string} [geo='US'] - Country ISO code (e.g. US, GB, CA)
 * @returns {Promise<object>} Map of trending queries and associated news metadata
 */
const getTrendingSearches = async (geo = 'US') => {
  try {
    const geoCode = (geo || 'US').toUpperCase();
    logger.info(`GCP Trends: Fetching real-time search trends from Google Trends for country "${geoCode}"...`);

    const endpoint = `https://trends.google.com/trending/rss`;
    const response = await axios.get(endpoint, {
      params: { geo: geoCode },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const xmlContent = response.data || '';
    const trends = parseTrendsRss(xmlContent);

    logger.info(`GCP Trends: Successfully harvested ${trends.length} trending keywords for "${geoCode}".`);

    return {
      success: true,
      geo: geoCode,
      totalCount: trends.length,
      trends: trends
    };
  } catch (err) {
    logger.error('GCP Trends Harvesting Error:', err);
    return {
      success: false,
      geo: geo,
      error: err.message,
      trends: []
    };
  }
};

export const GcpTrendsService = {
  getTrendingSearches
};
