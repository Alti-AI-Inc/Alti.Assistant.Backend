import axios from 'axios';
import { logger } from '../../../shared/logger.js';

/**
 * Decodes common XML HTML entities and extracts content from CDATA blocks within a given string.
 * This function handles named entities like `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`,
 * as well as numeric entities in both decimal (`&#123;`) and hexadecimal (`&#x123;`) formats.
 * CDATA blocks are removed, and their inner content is preserved.
 *
 * @param {string} str - The input string potentially containing XML entities and CDATA blocks.
 * @returns {string} The decoded string with entities resolved and CDATA blocks processed.
 */
const decodeXml = (str) => {
  if (!str) return '';
  let decoded = str;

  // First, remove CDATA blocks and extract their content
  decoded = decoded.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');

  // Then, decode named entities. Order matters for &amp;lt; etc.
  decoded = decoded.replace(/&amp;/g, '&');
  decoded = decoded.replace(/&lt;/g, '<');
  decoded = decoded.replace(/&gt;/g, '>');
  decoded = decoded.replace(/&quot;/g, '"');
  decoded = decoded.replace(/&apos;/g, "'");

  // Finally, decode numeric entities (decimal and hexadecimal)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
};

/**
 * Parses the XML content of a Google Trends RSS feed using regular expressions.
 * It extracts trending search items, including their title, approximate traffic, description,
 * associated picture, and details of a related news item if available.
 * This is a lightweight parser specifically tailored for the Google Trends RSS structure.
 *
 * @param {string} xmlText - The raw XML string content from the Google Trends RSS feed.
 * @returns {Array<Object>} An array of objects, each representing a trending search item.
 *   Each object contains:
 *   - `query` {string}: The main trending search query/title.
 *   - `approxTraffic` {string}: Approximate search traffic (e.g., "100,000+").
 *   - `description` {string}: A brief description of the trend.
 *   - `picture` {string}: URL to an associated image.
 *   - `newsItem` {Object|null}: An object containing details of a related news item, or `null` if none.
 *     - `title` {string}: Title of the news item.
 *     - `snippet` {string}: A short snippet from the news item.
 *     - `url` {string}: URL to the full news article.
 *     - `source` {string}: Source of the news article.
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
 * Retrieves daily and real-time trending searches from Google Trends for a specified country.
 * It fetches the RSS feed from Google Trends, parses the XML content, and returns a structured
 * list of trending queries along with associated metadata like traffic, description, and news items.
 *
 * @param {string} [geo='US'] - The ISO 3166-1 alpha-2 country code (e.g., 'US' for United States, 'GB' for Great Britain, 'CA' for Canada).
 *                               Defaults to 'US' if not provided.
 * @returns {Promise<Object>} A promise that resolves to an object containing the trending searches.
 *   - `success` {boolean}: Indicates if the operation was successful.
 *   - `geo` {string}: The country code used for the search.
 *   - `totalCount` {number}: The number of trending items found.
 *   - `trends` {Array<Object>}: An array of trending search items, each structured as defined by `parseTrendsRss`.
 *   - `error` {string} [optional]: An error message if the operation failed.
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

/**
 * @typedef {Object} GcpTrendsService
 * @property {function(string): Promise<Object>} getTrendingSearches - Function to retrieve trending searches from Google Trends.
 */

/**
 * Provides services for interacting with Google Trends to fetch trending search data.
 * This service encapsulates the logic for fetching and parsing Google Trends RSS feeds.
 *
 * @type {GcpTrendsService}
 */
export const GcpTrendsService = {
  getTrendingSearches
};