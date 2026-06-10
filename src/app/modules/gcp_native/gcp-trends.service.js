// Enterprise Dependency Agent: The 'axios' package is used. To mitigate security vulnerabilities (e.g., CVE-2023-45857), ensure the version is updated to 1.6.8 or later in your package.json.
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

// Pre-compile regex patterns for parsing RSS items to avoid re-creation in the loop.
// This is a minor optimization as modern JS engines might optimize this anyway,
// but it ensures regex objects are created only once, reducing potential overhead.
const ITEM_TAG_REGEXES = {
  title: /<title>([\s\S]*?)<\/title>/i,
  approxTraffic: /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i,
  description: /<description>([\s\S]*?)<\/description>/i,
  picture: /<ht:picture>([\s\S]*?)<\/ht:picture>/i,
  newsTitle: /<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/i,
  newsSnippet: /<ht:news_item_snippet>([\s\S]*?)<\/ht:news_item_snippet>/i,
  newsUrl: /<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/i,
  newsSource: /<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/i,
};

/**
 * Helper function to extract content from a specific XML tag within a given string.
 * @param {string} xmlString - The XML string to search within.
 * @param {RegExp} regex - The pre-compiled regular expression for the tag.
 * @returns {string} The trimmed content of the tag, or an empty string if not found.
 */
const extractTagContent = (xmlString, regex) => {
  const match = xmlString.match(regex);
  return match && match[1] ? match[1].trim() : '';
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
  // Use a global regex with exec in a loop for efficient iteration over all <item> blocks.
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemXml = itemMatch[1]; // The content inside <item>...</item>

    // Extract content using the helper function and pre-compiled regexes.
    // This reduces redundant regex object creation within the loop.
    const title = decodeXml(extractTagContent(itemXml, ITEM_TAG_REGEXES.title));
    const approxTraffic = extractTagContent(itemXml, ITEM_TAG_REGEXES.approxTraffic) || '50,000+';
    const description = decodeXml(extractTagContent(itemXml, ITEM_TAG_REGEXES.description));
    const picture = extractTagContent(itemXml, ITEM_TAG_REGEXES.picture);

    const newsTitle = extractTagContent(itemXml, ITEM_TAG_REGEXES.newsTitle);
    const newsSnippet = extractTagContent(itemXml, ITEM_TAG_REGEXES.newsSnippet);
    const newsUrl = extractTagContent(itemXml, ITEM_TAG_REGEXES.newsUrl);
    const newsSource = extractTagContent(itemXml, ITEM_TAG_REGEXES.newsSource);

    const newsItem = newsTitle ? {
      title: decodeXml(newsTitle),
      snippet: decodeXml(newsSnippet),
      url: newsUrl,
      source: decodeXml(newsSource)
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