import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  researchCompany,
  buildICP,
  analyzeProspect,
  scoreLeads,
  generateOutreachEmail,
  naturalLanguageSearch,
  summarizeCompany,
  getCompanyTimeline,
} from './explorium.agent.js';

const {
  mockLogger,
  mockExploriumService,
  mockGoogleGenerativeAI
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const mockExploriumService = {
    matchBusinessService: vi.fn(),
    enrichBusinessSingleService: vi.fn(),
    getCompanyIntelligenceService: vi.fn(),
    getProspectIntelligenceService: vi.fn(),
    fetchBusinessesService: vi.fn(),
    businessStatisticsService: vi.fn(),
    fetchBusinessEventsService: vi.fn(),
    getDecisionMakersService: vi.fn(),
    businessAutocompleteService: vi.fn(),
  };
  const mockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));

  return {
    mockLogger,
    mockExploriumService,
    mockGoogleGenerativeAI
  };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('./explorium.service.js', () => mockExploriumService);

// Mock withCache to simply execute the fetcher function
vi.mock('./explorium.cache.js', () => ({
  withCache: vi.fn().mockImplementation((key, params, fetcher) => fetcher()),
}));

// Mock GoogleGenerativeAI
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('@google/generative-ai', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    GoogleGenerativeAI: mockGoogleGenerativeAI,
  };
});

// Mock process.env for API key
const originalProcessEnv = process.env;

describe('explorium.agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.env for each test
    process.env = { ...originalProcessEnv };
    process.env.GEMINI_API_KEY = 'test-api-key'; // Default API key for most tests
  });

  // --- Test callLLM behavior (indirectly, by mocking its dependencies) ---
  describe('callLLM internal helper behavior', () => {
    it('should throw an error if no Gemini API key is configured', async () => {
      process.env.GEMINI_API_KEY = '';
      process.env.GOOGLE_AI_API_KEY = '';
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';

      // Since callLLM is not exported, we need to call an exported function that uses it.
      // researchCompany is a good candidate.
      const result = await researchCompany('example.com', 'What is it?');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Explorium Agent] LLM error:',
        'No Gemini API key configured'
      );
      expect(result.answer).toBe('Analysis unavailable.'); // researchCompany's fallback
    });

    it('should call LLM with correct parameters for text mode', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: { firmographics: { name: 'Example Corp' } },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'LLM response' } });

      // Call an exported function that uses callLLM
      await researchCompany('example.com', 'What is it?');

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.0-flash' });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: expect.any(String) }, { text: '\n\n' }, { text: expect.any(String) }] }],
      });
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text).toContain('You are an elite B2B market intelligence analyst');
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[2].text).toContain('COMPANY: example.com');
    });

    it('should call LLM with correct parameters for JSON mode', async () => {
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 1 }); // buildICP calls this
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '{"key": "value"}' } });

      // Call an exported function that uses callLLM in JSON mode
      await buildICP('some description');

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: expect.any(String) }, { text: '\n\n' }, { text: expect.any(String) }] }],
      });
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text).toContain('You are a B2B data expert');
      expect(mockGenerateContent.mock.calls[0][0].contents[0].parts[2].text).toContain('Convert this ICP to Explorium API filters');
    });

    it('should log an error and return null if LLM call fails', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: { firmographics: { name: 'Example Corp' } },
      });
      mockGenerateContent.mockRejectedValueOnce(new Error('LLM API error'));

      // Call an exported function that uses callLLM
      const result = await researchCompany('example.com', 'What is it?');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Explorium Agent] LLM error:',
        'LLM API error'
      );
      expect(result.answer).toBe('Analysis unavailable.');
    });
  });

  // --- Test researchCompany ---
  describe('researchCompany', () => {
    it('should return company research with LLM answer on success', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: {
          firmographics: { name: 'Example Corp' },
          strategic_insights: {},
          competitive_landscape: {},
        },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'LLM research answer.' } });

      const result = await researchCompany('example.com', 'What is their strategy?');

      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Agent] Research: example.com — "What is their strategy?"');
      expect(mockExploriumService.getCompanyIntelligenceService).toHaveBeenCalledWith(
        'example.com',
        ['firmographics', 'strategic_insights', 'competitive_landscape', 'workforce_trends', 'funding_and_acquisitions']
      );
      expect(result).toEqual({
        domain: 'example.com',
        business_id: 'biz123',
        answer: 'LLM research answer.',
        sources: {
          firmographics: { name: 'Example Corp' },
          strategic_insights: {},
          competitive_landscape: {},
        },
      });
    });

    it('should return "No Explorium match" if company intelligence service returns no match', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({ matched: false });

      const result = await researchCompany('nonexistent.com', 'What is their strategy?');

      expect(result).toEqual({
        domain: 'nonexistent.com',
        answer: 'No Explorium match for "nonexistent.com". Check the domain is correct (e.g. "stripe.com").',
        sources: null,
        business_id: null,
      });
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return "Analysis unavailable" if LLM call fails or returns empty', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: { firmographics: { name: 'Example Corp' } },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '' } }); // Empty LLM response

      const result = await researchCompany('example.com', 'What is their strategy?');

      expect(result.answer).toBe('Analysis unavailable.');
    });
  });

  // --- Test buildICP ---
  describe('buildICP', () => {
    it('should convert natural language description to Explorium filters and return count', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              filters: {
                country_code: { values: ['us'] },
                company_size: { values: ['51-200'] },
              },
              explanation: 'Based on description.',
            }),
        },
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 12345 });

      const description = 'US companies with 51-200 employees';
      const result = await buildICP(description);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Agent] Build ICP: "${description}"`);
      expect(mockExploriumService.businessStatisticsService).toHaveBeenCalledWith({
        country_code: { values: ['us'] },
        company_size: { values: ['51-200'] },
      });
      expect(result).toEqual({
        description,
        filters: {
          country_code: { values: ['us'] },
          company_size: { values: ['51-200'] },
        },
        explanation: 'Based on description.',
        estimated_count: 12345,
      });
    });

    it('should handle LLM returning invalid JSON for filters', async () => {
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 0 });

      const description = 'invalid json test';
      const result = await buildICP(description);

      expect(result.filters).toEqual({});
      expect(result.explanation).toBe('Could not parse response');
      expect(result.estimated_count).toBe(0);
    });

    it('should handle business intent topics mapping', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              filters: {
                business_intent_topics: { values: ['AI', 'Cloud'] },
              },
            }),
        },
      });
      mockExploriumService.businessAutocompleteService.mockImplementation((field, query) => {
        if (query === 'AI') return Promise.resolve(['Artificial Intelligence']);
        if (query === 'Cloud') return Promise.resolve(['Cloud Computing']);
        return Promise.resolve([]);
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 500 });

      const description = 'companies interested in AI and Cloud';
      const result = await buildICP(description);

      expect(mockExploriumService.businessAutocompleteService).toHaveBeenCalledWith('business_intent_topics', 'AI', true);
      expect(mockExploriumService.businessAutocompleteService).toHaveBeenCalledWith('business_intent_topics', 'Cloud', true);
      expect(result.filters).toEqual({
        business_intent_topics: {
          topics: ['Artificial Intelligence', 'Cloud Computing'],
          topic_intent_level: 'high_intent',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Agent] ICP Filter Topic mapped: "AI" -> "Artificial Intelligence"');
      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Agent] ICP Filter Topic mapped: "Cloud" -> "Cloud Computing"');
    });

    it('should handle autocomplete service errors for intent topics gracefully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              filters: {
                business_intent_topics: { values: ['AI', 'Cloud'] },
              },
            }),
        },
      });
      mockExploriumService.businessAutocompleteService.mockImplementation((field, query) => {
        if (query === 'AI') return Promise.reject(new Error('Autocomplete failed'));
        if (query === 'Cloud') return Promise.resolve(['Cloud Computing']);
        return Promise.resolve([]);
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 500 });

      const description = 'companies interested in AI and Cloud';
      const result = await buildICP(description);

      expect(mockLogger.warn).toHaveBeenCalledWith('[Explorium Agent] Autocomplete error for ICP topic "AI": Autocomplete failed');
      expect(result.filters).toEqual({
        business_intent_topics: {
          topics: ['AI', 'Cloud Computing'], // 'AI' should remain unmapped
          topic_intent_level: 'high_intent',
        },
      });
    });

    it('should return 0 count if businessStatisticsService fails', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ filters: { country_code: { values: ['us'] } } }),
        },
      });
      mockExploriumService.businessStatisticsService.mockRejectedValueOnce(new Error('Stats API error'));

      const description = 'US companies';
      const result = await buildICP(description);

      expect(result.estimated_count).toBe(0);
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  // --- Test analyzeProspect ---
  describe('analyzeProspect', () => {
    it('should return prospect brief on success', async () => {
      mockExploriumService.getProspectIntelligenceService.mockResolvedValueOnce({
        matched: true,
        prospect_id: 'p123',
        data: {
          professional_profile: { title: 'Engineer' },
          contacts_information: {},
          social_media: {},
        },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'LLM brief.' } });

      const email = 'test@example.com';
      const context = 'selling CRM';
      const result = await analyzeProspect(email, context);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Agent] Analyze prospect: ${email}`);
      expect(mockExploriumService.getProspectIntelligenceService).toHaveBeenCalledWith(email);
      expect(result).toEqual({
        email,
        prospect_id: 'p123',
        matched: true,
        meeting_context: context,
        brief: 'LLM brief.',
        raw_intel: {
          professional_profile: { title: 'Engineer' },
          contacts_information: {},
          social_media: {},
        },
      });
    });

    it('should return "No Explorium data found" if prospect intelligence service returns no match', async () => {
      mockExploriumService.getProspectIntelligenceService.mockResolvedValueOnce({ matched: false });

      const email = 'nonexistent@example.com';
      const result = await analyzeProspect(email, 'context');

      expect(result).toEqual({
        email,
        matched: false,
        brief: `No Explorium data found for ${email}.`,
        prospect_id: null,
        raw_intel: null,
      });
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return "Analysis unavailable" if LLM call fails or returns empty', async () => {
      mockExploriumService.getProspectIntelligenceService.mockResolvedValueOnce({
        matched: true,
        prospect_id: 'p123',
        data: { professional_profile: { title: 'Engineer' } },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '' } });

      const result = await analyzeProspect('test@example.com', 'context');

      expect(result.brief).toBe('Analysis unavailable.');
    });
  });

  // --- Test scoreLeads ---
  describe('scoreLeads', () => {
    const icpDescription = 'Series B SaaS companies in the US';
    const businesses = [
      { business_id: 'b1', name: 'Company A', company_size: '51-200', country_code: 'us' },
      { business_id: 'b2', name: 'Company B', company_size: '1-10', country_code: 'gb' },
      { business_id: 'b3', name: 'Company C', company_size: '201-500', country_code: 'us' },
      { business_id: 'b4', name: 'Company D', company_size: '51-200', country_code: 'us' },
      { business_id: 'b5', name: 'Company E', company_size: '1-10', country_code: 'gb' },
      { business_id: 'b6', name: 'Company F', company_size: '201-500', country_code: 'us' },
      { business_id: 'b7', name: 'Company G', company_size: '51-200', country_code: 'us' },
      { business_id: 'b8', name: 'Company H', company_size: '1-10', country_code: 'gb' },
      { business_id: 'b9', name: 'Company I', company_size: '201-500', country_code: 'us' },
      { business_id: 'b10', name: 'Company J', company_size: '51-200', country_code: 'us' },
      { business_id: 'b11', name: 'Company K', company_size: '1-10', country_code: 'gb' },
    ];

    it('should return an empty array if no businesses are provided', async () => {
      const result = await scoreLeads([], icpDescription);
      expect(result).toEqual([]);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should score leads in batches and sort them by score', async () => {
      // Mock for first batch (10 companies)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify([
              { id: 'b1', score: 90, tier: 'A', reasoning: 'Good fit' },
              { id: 'b2', score: 30, tier: 'D', reasoning: 'Bad fit' },
              { id: 'b3', score: 85, tier: 'A', reasoning: 'Good fit' },
              { id: 'b4', score: 70, tier: 'B', reasoning: 'Medium fit' },
              { id: 'b5', score: 20, tier: 'D', reasoning: 'Bad fit' },
              { id: 'b6', score: 95, tier: 'A', reasoning: 'Excellent fit' },
              { id: 'b7', score: 60, tier: 'B', reasoning: 'Medium fit' },
              { id: 'b8', score: 10, tier: 'D', reasoning: 'Very bad fit' },
              { id: 'b9', score: 80, tier: 'A', reasoning: 'Good fit' },
              { id: 'b10', score: 75, tier: 'B', reasoning: 'Medium fit' },
            ]),
        },
      });
      // Mock for second batch (1 company)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([{ id: 'b11', score: 40, tier: 'C', reasoning: 'Neutral fit' }]),
        },
      });

      const result = await scoreLeads(businesses, icpDescription);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Agent] Scoring ${businesses.length} leads`);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(11);
      expect(result[0].id).toBe('b6'); // Highest score
      expect(result[result.length - 1].id).toBe('b8'); // Lowest score
      expect(result).toEqual([
        expect.objectContaining({ id: 'b6', score: 95 }),
        expect.objectContaining({ id: 'b1', score: 90 }),
        expect.objectContaining({ id: 'b3', score: 85 }),
        expect.objectContaining({ id: 'b9', score: 80 }),
        expect.objectContaining({ id: 'b10', score: 75 }),
        expect.objectContaining({ id: 'b4', score: 70 }),
        expect.objectContaining({ id: 'b7', score: 60 }),
        expect.objectContaining({ id: 'b11', score: 40 }),
        expect.objectContaining({ id: 'b2', score: 30 }),
        expect.objectContaining({ id: 'b5', score: 20 }),
        expect.objectContaining({ id: 'b8', score: 10 }),
      ]);
    });

    it('should assign fallback scores if LLM returns invalid JSON for a batch', async () => {
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } }); // Invalid JSON
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([{ id: 'b11', score: 40, tier: 'C', reasoning: 'Neutral fit' }]),
        },
      });

      const result = await scoreLeads(businesses, icpDescription);

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      // First batch (10 companies) should get fallback scores
      for (let i = 0; i < 10; i++) {
        expect(result[i].id).toBe(businesses[i].business_id);
        expect(result[i].score).toBe(50);
        expect(result[i].tier).toBe('C');
        expect(result[i].reasoning).toBe('Insufficient data for scoring.');
      }
      // Last company should be scored correctly
      expect(result[10]).toEqual({ id: 'b11', score: 40, tier: 'C', reasoning: 'Neutral fit' });
    });

    it('should assign fallback scores if LLM call fails for a batch', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('LLM scoring error')); // LLM fails
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([{ id: 'b11', score: 40, tier: 'C', reasoning: 'Neutral fit' }]),
        },
      });

      const result = await scoreLeads(businesses, icpDescription);

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalledWith('[Explorium Agent] LLM error:', 'LLM scoring error');

      // First batch (10 companies) should get fallback scores
      for (let i = 0; i < 10; i++) {
        expect(result[i].id).toBe(businesses[i].business_id);
        expect(result[i].score).toBe(50);
        expect(result[i].tier).toBe('C');
        expect(result[i].reasoning).toBe('Insufficient data for scoring.');
      }
      // Last company should be scored correctly
      expect(result[10]).toEqual({ id: 'b11', score: 40, tier: 'C', reasoning: 'Neutral fit' });
    });
  });

  // --- Test generateOutreachEmail ---
  describe('generateOutreachEmail', () => {
    const prospect = {
      first_name: 'John',
      full_name: 'John Doe',
      job_title: 'Software Engineer',
      company_name: 'Acme Corp',
      job_department_main: 'Engineering',
      job_level_main: 'Individual Contributor',
      city: 'San Francisco',
      region_name: 'California',
      experience: [{ title: 'Engineer', company: 'Acme' }],
      skills: ['JavaScript', 'React'],
      email: 'john@acme.com',
    };
    const sender = {
      name: 'Jane Smith',
      company: 'Alti',
      product: 'AI Assistant',
      value_prop: 'helps sales teams close more deals',
    };

    it('should generate a personalized outreach email on success', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              subject: 'Quick question about Acme Corp, John',
              body: 'Hi John,\n\nI saw your work as a Software Engineer at Acme Corp. Our AI Assistant helps sales teams close more deals.\n\nWould you be open to a quick chat?',
              ps: 'P.S. Love your work with React!',
            }),
        },
      });

      const result = await generateOutreachEmail(prospect, sender, 'context about recent funding');

      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Agent] Outreach: John Doe`);
      expect(result).toEqual({
        subject: 'Quick question about Acme Corp, John',
        body: 'Hi John,\n\nI saw your work as a Software Engineer at Acme Corp. Our AI Assistant helps sales teams close more deals.\n\nWould you be open to a quick chat?',
        ps: 'P.S. Love your work with React!',
      });
    });

    it('should return fallback email if LLM returns invalid JSON', async () => {
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } });

      const result = await generateOutreachEmail(prospect, sender);

      expect(result.subject).toBe('John, quick question');
      expect(result.body).toContain('Hi John,\n\nI noticed your work at Acme Corp and wanted to share how AI Assistant might help.');
      expect(result.ps).toBe('');
    });

    it('should handle missing prospect data gracefully', async () => {
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } }); // Fallback

      const minimalProspect = { email: 'minimal@example.com' };
      const result = await generateOutreachEmail(minimalProspect, sender);

      expect(result.subject).toBe('minimal, quick question');
      expect(result.body).toContain('Hi minimal,\n\nI noticed your work at  and wanted to share how AI Assistant might help.');
    });
  });

  // --- Test naturalLanguageSearch ---
  describe('naturalLanguageSearch', () => {
    const query = 'fast-growing AI startups in NYC under 200 employees';
    const mockFilters = {
      company_size: { values: ['51-200'] },
      country_code: { values: ['us'] },
    };
    const mockBusinesses = [{ id: 'b1', name: 'AI Startup 1' }];

    it('should convert query to filters and fetch businesses', async () => {
      // Mock buildICP (which uses callLLM and businessStatisticsService)
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ filters: mockFilters, explanation: 'NL explanation' }) },
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 100 });
      mockExploriumService.fetchBusinessesService.mockResolvedValueOnce({
        data: mockBusinesses,
        total_results: 1,
      });

      const result = await naturalLanguageSearch(query, 10);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Agent] NL Search: "${query}"`);
      expect(mockExploriumService.fetchBusinessesService).toHaveBeenCalledWith({
        filters: mockFilters,
        mode: 'full',
        page_size: 10,
        size: 10,
      });
      expect(result).toEqual({
        query,
        filters_used: mockFilters,
        explanation: 'NL explanation',
        total_available: 100,
        results: mockBusinesses,
        returned: 1,
      });
    });

    it('should handle empty results from fetchBusinessesService', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ filters: mockFilters, explanation: 'NL explanation' }) },
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 0 });
      mockExploriumService.fetchBusinessesService.mockResolvedValueOnce({ data: [], total_results: 0 });

      const result = await naturalLanguageSearch(query, 10);

      expect(result.results).toEqual([]);
      expect(result.returned).toBe(0);
      expect(result.total_available).toBe(0);
    });

    it('should handle buildICP failure gracefully (empty filters)', async () => {
      // Simulate buildICP returning empty filters (e.g., LLM failure)
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'not json' }, // Invalid JSON for buildICP
      });
      mockExploriumService.businessStatisticsService.mockResolvedValueOnce({ count: 0 }); // buildICP will call this
      mockExploriumService.fetchBusinessesService.mockResolvedValueOnce({ data: [], total_results: 0 });

      const result = await naturalLanguageSearch(query, 10);

      expect(result.filters_used).toEqual({}); // buildICP fallback
      expect(result.explanation).toBe('Could not parse response'); // buildICP fallback
      expect(result.total_available).toBe(0);
      expect(mockExploriumService.fetchBusinessesService).toHaveBeenCalledWith({
        filters: {}, // Should call with empty filters
        mode: 'full',
        page_size: 10,
        size: 10,
      });
    });
  });

  // --- Test summarizeCompany ---
  describe('summarizeCompany', () => {
    it('should return company summary and key facts on success', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: {
          firmographics: { name: 'Example Corp', revenue: '10M-25M' },
          funding_and_acquisitions: {},
          workforce_trends: {},
          company_social_media: {},
          strategic_insights: {},
        },
      });
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: 'Example Corp is a company with 10M-25M revenue.',
              key_facts: ['Fact 1', 'Fact 2'],
            }),
        },
      });

      const result = await summarizeCompany('example.com');

      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Agent] Summarize: example.com');
      expect(mockExploriumService.getCompanyIntelligenceService).toHaveBeenCalledWith(
        'example.com',
        ['firmographics', 'funding_and_acquisitions', 'workforce_trends', 'company_social_media', 'strategic_insights']
      );
      expect(result).toEqual({
        domain: 'example.com',
        business_id: 'biz123',
        summary: 'Example Corp is a company with 10M-25M revenue.',
        key_facts: ['Fact 1', 'Fact 2'],
        raw_data: {
          firmographics: { name: 'Example Corp', revenue: '10M-25M' },
          funding_and_acquisitions: {},
        },
      });
    });

    it('should return "not found" message if company intelligence service returns no match', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({ matched: false });

      const result = await summarizeCompany('nonexistent.com');

      expect(result).toEqual({
        domain: 'nonexistent.com',
        business_id: null,
        summary: 'nonexistent.com was not found in Explorium\'s database of 80M+ companies.',
        key_facts: [],
      });
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return fallback summary if LLM returns invalid JSON', async () => {
      mockExploriumService.getCompanyIntelligenceService.mockResolvedValueOnce({
        matched: true,
        business_id: 'biz123',
        data: { firmographics: { name: 'Example Corp' } },
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } });

      const result = await summarizeCompany('example.com');

      expect(result.summary).toBe('example.com — data available, summary generation failed.');
      expect(result.key_facts).toEqual([]);
    });
  });

  // --- Test getCompanyTimeline ---
  describe('getCompanyTimeline', () => {
    it('should return company timeline and narrative on success', async () => {
      mockExploriumService.matchBusinessService.mockResolvedValueOnce({ business_id: 'biz123' });
      mockExploriumService.fetchBusinessEventsService.mockResolvedValueOnce({
        data: [
          { event_type: 'Funding', occurred_at: '2023-01-15', summary: 'Raised Series A' },
          { event_type: 'Product Launch', occurred_at: '2023-02-01', summary: 'New product released' },
        ],
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'LLM narrative.' } });

      const result = await getCompanyTimeline('example.com', 60);

      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Agent] Timeline: example.com (last 60 days)');
      expect(mockExploriumService.matchBusinessService).toHaveBeenCalledWith({ domain: 'example.com' });
      expect(mockExploriumService.fetchBusinessEventsService).toHaveBeenCalledWith(['biz123'], [], 60);
      expect(result).toEqual({
        domain: 'example.com',
        business_id: 'biz123',
        lookback_days: 60,
        event_count: 2,
        narrative: 'LLM narrative.',
        events: [
          { event_type: 'Funding', occurred_at: '2023-01-15', summary: 'Raised Series A' },
          { event_type: 'Product Launch', occurred_at: '2023-02-01', summary: 'New product released' },
        ],
      });
    });

    it('should return "Company not found" if matchBusinessService returns no business_id', async () => {
      mockExploriumService.matchBusinessService.mockResolvedValueOnce({ business_id: null });

      const result = await getCompanyTimeline('nonexistent.com');

      expect(result).toEqual({
        domain: 'nonexistent.com',
        business_id: null,
        narrative: 'Company not found.',
        events: [],
        event_count: 0,
      });
      expect(mockExploriumService.fetchBusinessEventsService).not.toHaveBeenCalled();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return "No recorded events" if fetchBusinessEventsService returns no events', async () => {
      mockExploriumService.matchBusinessService.mockResolvedValueOnce({ business_id: 'biz123' });
      mockExploriumService.fetchBusinessEventsService.mockResolvedValueOnce({ data: [] });

      const result = await getCompanyTimeline('example.com', 30);

      expect(result).toEqual({
        domain: 'example.com',
        business_id: 'biz123',
        narrative: 'No recorded events for example.com in the last 30 days.',
        events: [],
        event_count: 0,
      });
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return "Narrative generation failed" if LLM call fails or returns empty', async () => {
      mockExploriumService.matchBusinessService.mockResolvedValueOnce({ business_id: 'biz123' });
      mockExploriumService.fetchBusinessEventsService.mockResolvedValueOnce({
        data: [{ event_type: 'Funding', occurred_at: '2023-01-15', summary: 'Raised Series A' }],
      });
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '' } }); // Empty LLM response

      const result = await getCompanyTimeline('example.com', 30);

      expect(result.narrative).toBe('Narrative generation failed.');
    });
  });
});