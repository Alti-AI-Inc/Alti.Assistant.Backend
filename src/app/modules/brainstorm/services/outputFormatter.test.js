import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { outputFormatter } from './outputFormatter.js';

// Mock the logger dependency
const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Mock Date.toLocaleString for consistent output in exportToMarkdown
const MOCK_DATE_STRING = '1/1/2023, 12:00:00 AM';
const mockDate = new Date(MOCK_DATE_STRING);
const originalDate = global.Date;

beforeEach(() => {
  // Mock the Date constructor to return a fixed date
  global.Date = vi.fn((dateString) => {
    if (dateString) {
      return new originalDate(dateString);
    }
    return mockDate;
  });
  // Mock the toLocaleString method on the mocked Date instance
  global.Date.prototype.toLocaleString = vi.fn(() => MOCK_DATE_STRING);
  // Copy static methods like Date.now() if they are used elsewhere
  Object.assign(global.Date, originalDate);

  mockLogger.error.mockClear(); // Clear mocks before each test
});

afterEach(() => {
  global.Date = originalDate; // Restore original Date object
});

describe('outputFormatter', () => {
  describe('formatBrainstormResponse', () => {
    it('should format a complete brainstorm data object correctly', () => {
      const brainstormData = {
        summary: 'This is a summary of the brainstorm session.',
        mainIdeas: [
          {
            title: 'Idea 1 Title',
            description: 'Description for idea 1.',
            reasoning: 'Reasoning for idea 1.',
            category: 'Category A',
            perspective: 'User',
            priority: 'high',
          },
          {
            title: 'Idea 2 Title',
            description: 'Description for idea 2.',
          },
        ],
        subIdeas: [
          { title: 'Sub Idea 1', description: 'Description for sub idea 1.' },
          { title: 'Sub Idea 2', description: 'Description for sub idea 2.' },
        ],
        opportunities: [
          { title: 'Opportunity 1', description: 'Description for opportunity 1.', impact: 'high' },
          { title: 'Opportunity 2', description: 'Description for opportunity 2.' }, // Default impact
        ],
        risks: [
          { title: 'Risk 1', description: 'Description for risk 1.', severity: 'low', mitigation: 'Mitigation for risk 1.' },
          { title: 'Risk 2', description: 'Description for risk 2.' }, // Default severity
        ],
        nextSteps: ['Step 1', 'Step 2', 'Step 3'],
      };

      const expected = `This is a summary of the brainstorm session.

## 💡 Main Ideas (2)

### 1. Idea 1 Title
Description for idea 1.

**Why this works:** Reasoning for idea 1.
**Category:** Category A
**Perspective:** User
**Priority:** high

### 2. Idea 2 Title
Description for idea 2.


## 🔸 Supporting Ideas (2)

1. **Sub Idea 1**: Description for sub idea 1.
2. **Sub Idea 2**: Description for sub idea 2.

## 🚀 Opportunities

1. **Opportunity 1** (Impact: high)
   Description for opportunity 1.

2. **Opportunity 2** (Impact: medium)
   Description for opportunity 2.

## ⚠️ Potential Challenges

1. **Risk 1** (Severity: low)
   Description for risk 1.
   *Mitigation:* Mitigation for risk 1.

2. **Risk 2** (Severity: medium)
   Description for risk 2.

## 📋 Next Steps

1. Step 1
2. Step 2
3. Step 3`;

      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should return an empty string for an empty brainstorm data object', () => {
      const brainstormData = {};
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe('');
    });

    it('should format only summary if provided', () => {
      const brainstormData = { summary: 'Just a summary.' };
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe('Just a summary.');
    });

    it('should format only main ideas', () => {
      const brainstormData = {
        mainIdeas: [{ title: 'Main Idea', description: 'Main Description' }],
      };
      const expected = `## 💡 Main Ideas (1)

### 1. Main Idea
Main Description`;
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should format only sub ideas', () => {
      const brainstormData = {
        subIdeas: [{ title: 'Sub Idea', description: 'Sub Description' }],
      };
      const expected = `## 🔸 Supporting Ideas (1)

1. **Sub Idea**: Sub Description`;
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should format only opportunities', () => {
      const brainstormData = {
        opportunities: [{ title: 'Opportunity', description: 'Opportunity Description' }],
      };
      const expected = `## 🚀 Opportunities

1. **Opportunity** (Impact: medium)
   Opportunity Description`;
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should format only risks', () => {
      const brainstormData = {
        risks: [{ title: 'Risk', description: 'Risk Description' }],
      };
      const expected = `## ⚠️ Potential Challenges

1. **Risk** (Severity: medium)
   Risk Description`;
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should format only next steps', () => {
      const brainstormData = {
        nextSteps: ['Only one step'],
      };
      const expected = `## 📋 Next Steps

1. Only one step`;
      expect(outputFormatter.formatBrainstormResponse(brainstormData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = null; // This will cause an error when destructuring
      const expected = 'Unable to format brainstorm results. Please check the data.';
      expect(outputFormatter.formatBrainstormResponse(invalidData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error formatting brainstorm response:', expect.any(TypeError));
    });
  });

  describe('formatSWOT', () => {
    it('should format a complete SWOT data object correctly', () => {
      const swotData = {
        strengths: [{ title: 'Strong Brand', description: 'Well-recognized brand.', impact: 'high' }],
        weaknesses: [{ title: 'Legacy Tech', description: 'Outdated technology stack.', severity: 'high' }],
        opportunities: [{ title: 'New Market', description: 'Untapped market segment.', potential: 'high' }],
        threats: [{ title: 'Competitor', description: 'New competitor entering market.', risk: 'medium' }],
      };

      const expected = `## SWOT Analysis

### ✅ Strengths
1. **Strong Brand** (high impact)
   Well-recognized brand.

### ⚠️ Weaknesses
1. **Legacy Tech** (high severity)
   Outdated technology stack.

### 🚀 Opportunities
1. **New Market** (high potential)
   Untapped market segment.

### 🛡️ Threats
1. **Competitor** (medium risk)
   New competitor entering market.`;

      expect(outputFormatter.formatSWOT(swotData)).toBe(expected);
    });

    it('should return only the header for an empty SWOT data object', () => {
      const swotData = {};
      expect(outputFormatter.formatSWOT(swotData)).toBe('## SWOT Analysis');
    });

    it('should format only strengths with default impact', () => {
      const swotData = {
        strengths: [{ title: 'Good Team', description: 'Experienced team.' }],
      };
      const expected = `## SWOT Analysis

### ✅ Strengths
1. **Good Team** (medium impact)
   Experienced team.`;
      expect(outputFormatter.formatSWOT(swotData)).toBe(expected);
    });

    it('should format only weaknesses with default severity', () => {
      const swotData = {
        weaknesses: [{ title: 'Poor Marketing', description: 'Ineffective marketing.' }],
      };
      const expected = `## SWOT Analysis

### ⚠️ Weaknesses
1. **Poor Marketing** (medium severity)
   Ineffective marketing.`;
      expect(outputFormatter.formatSWOT(swotData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = null;
      const expected = 'Unable to format SWOT analysis.';
      expect(outputFormatter.formatSWOT(invalidData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error formatting SWOT:', expect.any(TypeError));
    });
  });

  describe('formatSCAMPER', () => {
    it('should format a complete SCAMPER data object correctly', () => {
      const scamperData = {
        substitute: ['Replace X with Y'],
        combine: ['Combine A and B'],
        adapt: ['Adapt to new regulations'],
        modify: ['Modify existing feature'],
        putToOtherUses: ['Use product for Z'],
        eliminate: ['Remove unnecessary step'],
        reverse: ['Reverse the process'],
      };

      const expected = `## SCAMPER Analysis

### 🔄 Substitute
*What can be substituted?*

1. Replace X with Y

### 🤝 Combine
*What can be combined?*

1. Combine A and B

### 🔧 Adapt
*What can be adapted?*

1. Adapt to new regulations

### ⚡ Modify
*What can be modified?*

1. Modify existing feature

### ♻️ Put to Other Uses
*What other uses?*

1. Use product for Z

### ✂️ Eliminate
*What can be eliminated?*

1. Remove unnecessary step

### 🔀 Reverse
*What can be reversed?*

1. Reverse the process`;

      expect(outputFormatter.formatSCAMPER(scamperData)).toBe(expected);
    });

    it('should return only the header for an empty SCAMPER data object', () => {
      const scamperData = {};
      expect(outputFormatter.formatSCAMPER(scamperData)).toBe('## SCAMPER Analysis');
    });

    it('should format only selected SCAMPER sections', () => {
      const scamperData = {
        substitute: ['Substitute item A'],
        eliminate: ['Eliminate step B'],
      };
      const expected = `## SCAMPER Analysis

### 🔄 Substitute
*What can be substituted?*

1. Substitute item A

### ✂️ Eliminate
*What can be eliminated?*

1. Eliminate step B`;
      expect(outputFormatter.formatSCAMPER(scamperData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = null;
      const expected = 'Unable to format SCAMPER analysis.';
      expect(outputFormatter.formatSCAMPER(invalidData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error formatting SCAMPER:', expect.any(TypeError));
    });
  });

  describe('formatPerspectives', () => {
    it('should format a complete PerspectiveData object correctly', () => {
      const perspectiveData = {
        business: {
          considerations: ['Market demand', 'Revenue potential'],
          opportunities: ['Expand market share'],
          challenges: ['High competition'],
          recommendations: ['Focus on niche market'],
        },
        technical: {
          considerations: ['Scalability', 'Security'],
          opportunities: ['Adopt new framework'],
          challenges: ['Integration complexity'],
          recommendations: ['Microservices architecture'],
        },
        unknown_perspective: {
          considerations: ['Unforeseen factors'],
        },
      };

      const expected = `## Multi-Perspective Analysis

### 💼 Business Perspective

**Key Considerations:**
- Market demand
- Revenue potential

**Opportunities:**
- Expand market share

**Challenges:**
- High competition

**Recommendations:**
- Focus on niche market

### ⚙️ Technical Perspective

**Key Considerations:**
- Scalability
- Security

**Opportunities:**
- Adopt new framework

**Challenges:**
- Integration complexity

**Recommendations:**
- Microservices architecture

### 📊 Unknown_perspective Perspective

**Key Considerations:**
- Unforeseen factors`;

      expect(outputFormatter.formatPerspectives(perspectiveData)).toBe(expected);
    });

    it('should return only the header for an empty PerspectiveData object', () => {
      const perspectiveData = {};
      expect(outputFormatter.formatPerspectives(perspectiveData)).toBe('## Multi-Perspective Analysis');
    });

    it('should format a single perspective with only some sections', () => {
      const perspectiveData = {
        user_centric: {
          considerations: ['User experience'],
          opportunities: ['Improved engagement'],
        },
      };
      const expected = `## Multi-Perspective Analysis

### 👥 User_centric Perspective

**Key Considerations:**
- User experience

**Opportunities:**
- Improved engagement`;
      expect(outputFormatter.formatPerspectives(perspectiveData)).toBe(expected);
    });

    it('should handle a perspective with empty arrays for all sections', () => {
      const perspectiveData = {
        strategic: {
          considerations: [],
          opportunities: [],
          challenges: [],
          recommendations: [],
        },
      };
      const expected = `## Multi-Perspective Analysis

### 🎯 Strategic Perspective`;
      expect(outputFormatter.formatPerspectives(perspectiveData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = null;
      const expected = 'Unable to format perspective analysis.';
      expect(outputFormatter.formatPerspectives(invalidData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error formatting perspectives:', expect.any(TypeError));
    });
  });

  describe('formatRefinements', () => {
    it('should format a complete RefinementData object correctly', () => {
      const refinementData = {
        refinedIdeas: [
          {
            title: 'Refined Idea A',
            description: 'Description of refined idea A.',
            improvements: ['Improved UI', 'Faster performance'],
            reasoning: 'Better user adoption.',
          },
          {
            title: 'Refined Idea B',
            description: 'Description of refined idea B.',
          },
        ],
        enhancements: [
          { aspect: 'Security', suggestion: 'Add 2FA', impact: 'High' },
          { aspect: 'Performance', suggestion: 'Optimize database queries' },
        ],
        alternativeApproaches: [
          {
            approach: 'Approach X',
            description: 'Description of approach X.',
            pros: ['Cost-effective'],
            cons: ['Limited scalability'],
          },
          {
            approach: 'Approach Y',
            description: 'Description of approach Y.',
          },
        ],
      };

      const expected = `## Refinement Suggestions

### ✨ Refined Ideas

**1. Refined Idea A**
Description of refined idea A.

*Improvements:*
- Improved UI
- Faster performance

*Why:* Better user adoption.

**2. Refined Idea B**
Description of refined idea B.


### 🔧 Enhancements

1. **Security**: Add 2FA
   *Impact:* High

2. **Performance**: Optimize database queries

### 🔀 Alternative Approaches

**1. Approach X**
Description of approach X.

*Pros:*
- Cost-effective

*Cons:*
- Limited scalability

**2. Approach Y**
Description of approach Y.`;

      expect(outputFormatter.formatRefinements(refinementData)).toBe(expected);
    });

    it('should return only the header for an empty RefinementData object', () => {
      const refinementData = {};
      expect(outputFormatter.formatRefinements(refinementData)).toBe('## Refinement Suggestions');
    });

    it('should format only refined ideas', () => {
      const refinementData = {
        refinedIdeas: [{ title: 'Refined Idea', description: 'Refined Description' }],
      };
      const expected = `## Refinement Suggestions

### ✨ Refined Ideas

**1. Refined Idea**
Refined Description`;
      expect(outputFormatter.formatRefinements(refinementData)).toBe(expected);
    });

    it('should format only enhancements', () => {
      const refinementData = {
        enhancements: [{ aspect: 'UI', suggestion: 'Improve colors' }],
      };
      const expected = `## Refinement Suggestions

### 🔧 Enhancements

1. **UI**: Improve colors`;
      expect(outputFormatter.formatRefinements(refinementData)).toBe(expected);
    });

    it('should format only alternative approaches', () => {
      const refinementData = {
        alternativeApproaches: [{ approach: 'New Way', description: 'A different method.' }],
      };
      const expected = `## Refinement Suggestions

### 🔀 Alternative Approaches

**1. New Way**
A different method.`;
      expect(outputFormatter.formatRefinements(refinementData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = null;
      const expected = 'Unable to format refinement suggestions.';
      expect(outputFormatter.formatRefinements(invalidData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error formatting refinements:', expect.any(TypeError));
    });
  });

  describe('createMetadataSummary', () => {
    it('should create a complete metadata summary', () => {
      const brainstormData = {
        mainIdeas: [{ title: 'A' }],
        subIdeas: [{ title: 'B' }, { title: 'C' }],
        opportunities: [{ title: 'D' }],
        risks: [{ title: 'E' }, { title: 'F' }],
        nextSteps: ['G', 'H', 'I'],
      };
      const params = {
        technique: 'SWOT',
        perspectives: ['business', 'technical'],
        depth: 'detailed',
        brainstormType: 'product_development',
      };

      const expected = {
        totalIdeasGenerated: 3,
        mainIdeas: 1,
        subIdeas: 2,
        opportunities: 1,
        risks: 2,
        nextSteps: 3,
        techniqueUsed: 'SWOT',
        perspectivesAnalyzed: ['business', 'technical'],
        depthLevel: 'detailed',
        brainstormType: 'product_development',
      };

      expect(outputFormatter.createMetadataSummary(brainstormData, params)).toEqual(expected);
    });

    it('should return default values for empty brainstormData and params', () => {
      const brainstormData = {};
      const params = {};

      const expected = {
        totalIdeasGenerated: 0,
        mainIdeas: 0,
        subIdeas: 0,
        opportunities: 0,
        risks: 0,
        nextSteps: 0,
        techniqueUsed: 'free_association',
        perspectivesAnalyzed: [],
        depthLevel: 'standard',
        brainstormType: 'general',
      };

      expect(outputFormatter.createMetadataSummary(brainstormData, params)).toEqual(expected);
    });

    it('should handle null or undefined brainstormData gracefully', () => {
      const params = { technique: 'SWOT' };
      const expected = {
        totalIdeasGenerated: 0,
        mainIdeas: 0,
        subIdeas: 0,
        opportunities: 0,
        risks: 0,
        nextSteps: 0,
        techniqueUsed: 'SWOT',
        perspectivesAnalyzed: [],
        depthLevel: 'standard',
        brainstormType: 'general',
      };
      expect(outputFormatter.createMetadataSummary(null, params)).toEqual(expected);
      expect(outputFormatter.createMetadataSummary(undefined, params)).toEqual(expected);
    });

    it('should handle errors gracefully and log them', () => {
      const invalidData = { mainIdeas: 'not an array' }; // Will cause error when accessing .length
      const expected = {};
      expect(outputFormatter.createMetadataSummary(invalidData)).toEqual(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error creating metadata summary:', expect.any(TypeError));
    });
  });

  describe('exportToMarkdown', () => {
    // Mock formatBrainstormResponse to isolate exportToMarkdown's logic
    const originalFormatBrainstormResponse = outputFormatter.formatBrainstormResponse;
    beforeEach(() => {
      outputFormatter.formatBrainstormResponse = vi.fn(() => 'Formatted Brainstorm Content');
    });
    afterEach(() => {
      outputFormatter.formatBrainstormResponse = originalFormatBrainstormResponse;
    });

    it('should export a complete session to markdown', () => {
      const conversationData = {
        conversationId: 'conv-123',
        title: 'My Brainstorm Session',
      };
      const brainstormData = { summary: 'Test summary' };

      const expected = `# Brainstorm Session Export

**Date:** ${MOCK_DATE_STRING}
**Session ID:** conv-123

## My Brainstorm Session

---

Formatted Brainstorm Content`;

      expect(outputFormatter.exportToMarkdown(conversationData, brainstormData)).toBe(expected);
      expect(outputFormatter.formatBrainstormResponse).toHaveBeenCalledWith(brainstormData);
    });

    it('should export with default values for empty conversationData and brainstormData', () => {
      const expected = `# Brainstorm Session Export

**Date:** ${MOCK_DATE_STRING}
**Session ID:** N/A

---

Formatted Brainstorm Content`;

      expect(outputFormatter.exportToMarkdown({}, {})).toBe(expected);
      expect(outputFormatter.formatBrainstormResponse).toHaveBeenCalledWith({});
    });

    it('should export without title if not provided', () => {
      const conversationData = { conversationId: 'conv-456' };
      const brainstormData = { summary: 'Another summary' };

      const expected = `# Brainstorm Session Export

**Date:** ${MOCK_DATE_STRING}
**Session ID:** conv-456

---

Formatted Brainstorm Content`;

      expect(outputFormatter.exportToMarkdown(conversationData, brainstormData)).toBe(expected);
    });

    it('should handle errors gracefully and log them', () => {
      // Force an error in the exportToMarkdown function itself (e.g., by making conversationData non-object)
      const invalidConversationData = null;
      const brainstormData = {};
      const expected = '# Export Error\n\nUnable to export brainstorm session.';

      expect(outputFormatter.exportToMarkdown(invalidConversationData, brainstormData)).toBe(expected);
      expect(mockLogger.error).toHaveBeenCalledWith('Error exporting to markdown:', expect.any(TypeError));
    });
  });
});