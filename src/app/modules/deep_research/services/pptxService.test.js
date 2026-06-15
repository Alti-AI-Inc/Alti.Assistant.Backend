import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generatePPTXReport } from '../pptxService'; // Adjust path as needed

const {
  mockPptxgen
} = vi.hoisted(() => {
  // Mock pptxgenjs
  const mockPptxgen = vi.fn();

  return {
    mockPptxgen
  };
});
const mockPptxInstance = {
  layout: '',
  addSlide: vi.fn(),
  write: vi.fn().mockImplementation(() => Promise.resolve(Buffer.from('mock_pptx_buffer'))),
};

// Array to hold distinct mock slide instances
const mockSlideInstances = [];

// Mock the pptxgenjs module
vi.mock('pptxgenjs', () => ({
  default: mockPptxgen,
}));

describe('generatePPTXReport', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockPptxgen.mockClear();
    mockPptxInstance.addSlide.mockClear();
    mockPptxInstance.write.mockClear();
    mockSlideInstances.length = 0; // Clear the array of slide instances

    // Re-configure mock implementations
    mockPptxgen.mockImplementation(() => mockPptxInstance);
    mockPptxInstance.addSlide.mockImplementation(() => {
      const newSlide = {
        background: {},
        addShape: vi.fn(),
        addText: vi.fn(),
        addTable: vi.fn(),
      };
      mockSlideInstances.push(newSlide); // Store each new slide instance
      return newSlide;
    });

    // Mock Date for consistent filename generation
    vi.useFakeTimers();
    const mockDate = new Date('2023-10-26T10:00:00Z');
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize pptxgen and set layout', async () => {
    const reportData = { query: 'test query' };
    await generatePPTXReport(reportData);

    expect(mockPptxgen).toHaveBeenCalledTimes(1);
    expect(mockPptxInstance.layout).toBe('LAYOUT_16x9');
  });

  it('should create 4 slides', async () => {
    const reportData = { query: 'test query' };
    await generatePPTXReport(reportData);

    expect(mockPptxInstance.addSlide).toHaveBeenCalledTimes(4);
    expect(mockSlideInstances.length).toBe(4);
  });

  it('should populate slide 1 with dynamic data and default values', async () => {
    const reportData = {
      title: 'Custom Report Title',
      query: 'Impact of AI on software development',
      quantitativeFacts: [
        { metric: 'AI-driven code generation efficiency', value: '50%', source: 'Internal Study', trustLevel: 'HIGH' },
        { metric: 'Bug reduction rate with AI assistance', value: '20%', source: 'External Report', trustLevel: 'MEDIUM' },
      ],
      metadata: {
        qualityMetrics: { sourceDiversity: 9.0, informationDepth: 8.5, topicCoverage: 9.2, credibilityScore: 9.8 },
      },
    };
    await generatePPTXReport(reportData);

    const slide1 = mockSlideInstances[0];
    expect(slide1).toBeDefined();

    // Check for title and query
    expect(slide1.addText).toHaveBeenCalledWith(
      reportData.title,
      expect.objectContaining({ fontSize: 24, bold: true, color: '1E293B' })
    );
    expect(slide1.addText).toHaveBeenCalledWith(
      `Objective: "${reportData.query}"`,
      expect.objectContaining({ fontSize: 11, italic: true })
    );

    // Check for quality metrics
    expect(slide1.addText).toHaveBeenCalledWith(
      'Source Diversity',
      expect.any(Object)
    );
    expect(slide1.addText).toHaveBeenCalledWith(
      '9.0/10', // From reportData
      expect.any(Object)
    );

    // Check for gold fact
    expect(slide1.addText).toHaveBeenCalledWith(
      reportData.quantitativeFacts[0].value,
      expect.objectContaining({ fontSize: 24, bold: true, color: '0F766E' })
    );
    expect(slide1.addText).toHaveBeenCalledWith(
      `"${reportData.quantitativeFacts[0].metric}" - Verified in: ${reportData.quantitativeFacts[0].source}`,
      expect.any(Object)
    );

    // Test default gold fact if none provided
    mockSlideInstances.length = 0; // Clear slides for a new run
    mockPptxInstance.addSlide.mockClear();
    const reportDataNoFacts = { query: 'test query' };
    await generatePPTXReport(reportDataNoFacts);
    const slide1NoFacts = mockSlideInstances[0];
    expect(slide1NoFacts.addText).toHaveBeenCalledWith(
      '10x', // Default value
      expect.objectContaining({ fontSize: 24, bold: true, color: '0F766E' })
    );
  });

  it('should populate slide 2 with quantitative facts table', async () => {
    const reportData = {
      query: 'test query',
      quantitativeFacts: [
        { metric: 'Fact A', value: '10%', source: 'Source A', trustLevel: 'HIGH', verificationScore: 90 },
        { metric: 'Fact B', value: '20%', source: 'Source B', trustLevel: 'MEDIUM', verificationScore: 80 },
      ],
    };
    await generatePPTXReport(reportData);

    const slide2 = mockSlideInstances[1];
    expect(slide2).toBeDefined();

    const expectedTableRows = [
      [
        expect.objectContaining({ text: 'Metric Description' }),
        expect.objectContaining({ text: 'Value' }),
        expect.objectContaining({ text: 'Reference Source' }),
        expect.objectContaining({ text: 'Trust Level' }),
        expect.objectContaining({ text: 'Score' }),
      ],
      [
        expect.objectContaining({ text: 'Fact A' }),
        expect.objectContaining({ text: '10%' }),
        expect.objectContaining({ text: 'Source A' }),
        expect.objectContaining({ text: 'HIGH' }),
        expect.objectContaining({ text: '90%' }),
      ],
      [
        expect.objectContaining({ text: 'Fact B' }),
        expect.objectContaining({ text: '20%' }),
        expect.objectContaining({ text: 'Source B' }),
        expect.objectContaining({ text: 'MEDIUM' }),
        expect.objectContaining({ text: '80%' }),
      ],
    ];

    expect(slide2.addTable).toHaveBeenCalledWith(
      expect.arrayContaining(expectedTableRows),
      expect.any(Object)
    );

    // Test default facts if none provided
    mockSlideInstances.length = 0; // Clear slides for a new run
    mockPptxInstance.addSlide.mockClear();
    const reportDataNoFacts = { query: 'test query' };
    await generatePPTXReport(reportDataNoFacts);
    const slide2NoFacts = mockSlideInstances[1];
    expect(slide2NoFacts.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.any(Array), // Header row
        expect.arrayContaining([expect.objectContaining({ text: 'Productivity acceleration across strategic engineering cohorts' })]),
        expect.arrayContaining([expect.objectContaining({ text: 'Pilot projects facing deprecation due to governance debt' })]),
        expect.arrayContaining([expect.objectContaining({ text: 'Average speed improvement in multi-agent orchestration tasks' })]),
      ]),
      expect.any(Object)
    );
  });

  it('should populate slide 3 with dynamic debate bubbles or defaults', async () => {
    const reportDataWithReview = {
      query: 'test query',
      metadata: {
        reviewComments: 'McKinsey says this, Gartner says that, YC agrees.',
      },
    };
    await generatePPTXReport(reportDataWithReview);

    const slide3 = mockSlideInstances[2];
    expect(slide3).toBeDefined();

    // Check for specific speaker quotes from dynamic extraction
    expect(slide3.addText).toHaveBeenCalledWith(
      expect.stringContaining('McKinsey Strategy Partner'),
      expect.any(Object)
    );
    expect(slide3.addText).toHaveBeenCalledWith(
      expect.stringContaining('We must isolate the velocity bottlenecks.'),
      expect.any(Object)
    );

    // Test default debate bubbles if no relevant review comments
    mockSlideInstances.length = 0; // Clear slides for a new run
    mockPptxInstance.addSlide.mockClear();
    const reportDataNoReview = { query: 'test query', metadata: { reviewComments: 'Some other comments.' } };
    await generatePPTXReport(reportDataNoReview);
    const slide3NoReview = mockSlideInstances[2];
    expect(slide3NoReview.addText).toHaveBeenCalledWith(
      expect.stringContaining('Isolating local vs. global developer velocity is crucial.'),
      expect.any(Object)
    );
  });

  it('should populate slide 4 with recommendations', async () => {
    const reportData = { query: 'test query' };
    await generatePPTXReport(reportData);

    const slide4 = mockSlideInstances[3];
    expect(slide4).toBeDefined();

    // Check for specific recommendation text
    expect(slide4.addText).toHaveBeenCalledWith(
      expect.stringContaining('• Deploy Unified AI Governance telemetry nodes across all active developer environments (1-30 Days).'),
      expect.any(Object)
    );
    expect(slide4.addText).toHaveBeenCalledWith(
      expect.stringContaining('Briefing Index Summary'),
      expect.any(Object)
    );
  });

  it('should call pptx.write and return correct output structure', async () => {
    const reportData = { query: 'test query for filename' };
    const result = await generatePPTXReport(reportData);

    expect(mockPptxInstance.write).toHaveBeenCalledWith('nodebuffer');
    expect(result).toEqual({
      buffer: Buffer.from('mock_pptx_buffer'),
      filename: 'research_deck_test_query_for_filename_2023-10-26.pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: Buffer.from('mock_pptx_buffer').length,
    });
  });

  it('should generate a sanitized filename', async () => {
    const reportData = { query: 'Query with !@#$%^&*() special chars and spaces' };
    const result = await generatePPTXReport(reportData);

    expect(result.filename).toBe('research_deck_query_with_special_chars_and_spaces_2023-10-26.pptx');
  });

  it('should handle empty reportData gracefully', async () => {
    const reportData = {};
    const result = await generatePPTXReport(reportData);

    expect(mockPptxgen).toHaveBeenCalledTimes(1);
    expect(mockPptxInstance.addSlide).toHaveBeenCalledTimes(4);
    expect(mockPptxInstance.write).toHaveBeenCalledWith('nodebuffer');
    expect(result.filename).toBe('research_deck__2023-10-26.pptx'); // Empty query results in empty string
    expect(result.buffer).toBeInstanceOf(Buffer);

    // Check default content on slide 1
    const slide1 = mockSlideInstances[0];
    expect(slide1.addText).toHaveBeenCalledWith(
      'Executive Strategy Briefing Dashboard', // Default title
      expect.any(Object)
    );
    expect(slide1.addText).toHaveBeenCalledWith(
      'Objective: ""', // Empty query
      expect.any(Object)
    );
  });
});