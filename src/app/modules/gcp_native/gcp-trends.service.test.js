import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { logger } from '../../../shared/logger.js';
import { GcpTrendsService } from './gcp-trends.service.js';

vi.mock('axios');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const MOCK_RSS_XML = `
<rss version="2.0" xmlns:ht="https://trends.google.com/trends/trendingsearches/daily">
<channel>
  <title>Daily Search Trends</title>
  <item>
    <title>Test Query 1</title>
    <ht:approx_traffic>200,000+</ht:approx_traffic>
    <description>Description for Test Query 1</description>
    <ht:picture>https://example.com/pic1.jpg</ht:picture>
    <ht:news_item>
      <ht:news_item_title>News Title 1 &amp; More</ht:news_item_title>
      <ht:news_item_snippet><![CDATA[This is a snippet with <b>bold</b> text.]]></ht:news_item_snippet>
      <ht:news_item_url>https://example.com/news1</ht:news_item_url>
      <ht:news_item_source>News Source 1</ht:news_item_source>
    </ht:news_item>
  </item>
  <item>
    <title>Test Query 2 &lt;script&gt;alert(1)&lt;/script&gt;</title>
    <ht:approx_traffic>100,000+</ht:approx_traffic>
    <description></description>
    <ht:picture>https://example.com/pic2.jpg</ht:picture>
  </item>
  <item>
    <title>Query with no traffic</title>
    <description>A description with numeric entity &#123; and hex &#x27;</description>
    <ht:picture>https://example.com/pic3.jpg</ht:picture>
  </item>
  <item>
    <!-- This item has no title and should be skipped -->
    <ht:approx_traffic>5,000+</ht:approx_traffic>
    <description>Invalid item</description>
  </item>
</channel>
</rss>
`;

describe('GcpTrendsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getTrendingSearches', () => {
    it('should fetch and parse trending searches successfully for a given geo', async () => {
      axios.get.mockResolvedValue({ data: MOCK_RSS_XML });

      const result = await GcpTrendsService.getTrendingSearches('CA');

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        'https://trends.google.com/trending/rss',
        {
          params: { geo: 'CA' },
          headers: {
            'User-Agent': expect.any(String),
          },
        }
      );

      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Fetching real-time search trends from Google Trends for country "CA"...');
      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Successfully harvested 3 trending keywords for "CA".');
      expect(logger.error).not.toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        geo: 'CA',
        totalCount: 3,
        trends: [
          {
            query: 'Test Query 1',
            approxTraffic: '200,000+',
            description: 'Description for Test Query 1',
            picture: 'https://example.com/pic1.jpg',
            newsItem: {
              title: 'News Title 1 & More',
              snippet: 'This is a snippet with <b>bold</b> text.',
              url: 'https://example.com/news1',
              source: 'News Source 1',
            },
          },
          {
            query: 'Test Query 2 <script>alert(1)</script>',
            approxTraffic: '100,000+',
            description: '',
            picture: 'https://example.com/pic2.jpg',
            newsItem: null,
          },
          {
            query: 'Query with no traffic',
            approxTraffic: '50,000+', // Default value
            description: "A description with numeric entity { and hex '",
            picture: 'https://example.com/pic3.jpg',
            newsItem: null,
          },
        ],
      });
    });

    it('should use "US" as the default geo if none is provided', async () => {
      axios.get.mockResolvedValue({ data: MOCK_RSS_XML });

      await GcpTrendsService.getTrendingSearches();
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { geo: 'US' } })
      );

      await GcpTrendsService.getTrendingSearches(null);
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { geo: 'US' } })
      );
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('Network Error');
      axios.get.mockRejectedValue(error);

      const result = await GcpTrendsService.getTrendingSearches('GB');

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Fetching real-time search trends from Google Trends for country "GB"...');
      expect(logger.error).toHaveBeenCalledWith('GCP Trends Harvesting Error:', error);

      expect(result).toEqual({
        success: false,
        geo: 'GB',
        error: 'Network Error',
        trends: [],
      });
    });

    it('should handle empty or malformed XML responses', async () => {
      axios.get.mockResolvedValue({ data: '' });

      const result = await GcpTrendsService.getTrendingSearches('DE');

      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Fetching real-time search trends from Google Trends for country "DE"...');
      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Successfully harvested 0 trending keywords for "DE".');
      expect(logger.error).not.toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        geo: 'DE',
        totalCount: 0,
        trends: [],
      });
    });

    it('should handle responses with no valid <item> tags', async () => {
      const noItemsXml = `
        <rss version="2.0">
          <channel><title>Empty Trends</title></channel>
        </rss>`;
      axios.get.mockResolvedValue({ data: noItemsXml });

      const result = await GcpTrendsService.getTrendingSearches('FR');

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(0);
      expect(result.trends).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith('GCP Trends: Successfully harvested 0 trending keywords for "FR".');
    });
  });
});