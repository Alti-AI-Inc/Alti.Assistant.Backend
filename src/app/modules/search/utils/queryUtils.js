/**
 * Query Utility Functions
 * Rule-based query classification and date context injection
 */

/**
 * Fast rule-based query classification to avoid unnecessary LLM calls
 * Returns: { isSimple: boolean, queryType: string, confidence: number }
 */
export const classifyQueryFast = (query) => {
  const lowerQuery = query.toLowerCase().trim();

  // Simple factual queries - high confidence
  const simpleFactPatterns = [
    /^what is (the |a )?[a-zA-Z0-9\s]+\?*$/,
    /^who is [a-zA-Z0-9\s]+\?*$/,
    /^when (did|was|is) [a-zA-Z0-9\s]+\?*$/,
    /^where is [a-zA-Z0-9\s]+\?*$/,
    /^how many [a-zA-Z0-9\s]+\?*$/,
    /^define [a-zA-Z0-9\s]+$/,
    /^meaning of [a-zA-Z0-9\s]+$/,
  ];

  // Time-sensitive queries - need search
  const timeSensitivePatterns = [
    /\b(today|now|current|latest|recent|2024|2025)\b/,
    /\b(next|upcoming|when is the next)\b/,
    /\b(schedule|game|match|event)\b.*\b(today|tomorrow|this week|next)\b/,
    /\b(stock price|weather|news)\b/,
  ];

  // Video-related queries
  const videoPatterns = [
    /\b(video|tutorial|how to|guide|demo|watch)\b/,
    /\b(youtube|show me|explain|walkthrough)\b/,
    /\b(\d+\s*(video|tutorial|clip|demo)s?)\b/,
  ];

  // Complex queries that need full workflow
  const complexPatterns = [
    /\b(compare|vs|versus|difference between)\b/,
    /\b(analyze|research|detailed|comprehensive)\b/,
    /\b(pros and cons|advantages|disadvantages)\b/,
    /\w+.*\w+.*\w+.*\w+.*\w+/, // More than 5 meaningful words
  ];

  // Check for simple factual queries
  for (const pattern of simpleFactPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: true,
        queryType: 'factual',
        confidence: 0.9,
        recommendedAction: 'direct_answer',
      };
    }
  }

  // Check for time-sensitive queries
  for (const pattern of timeSensitivePatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'time_sensitive',
        confidence: 0.95,
        recommendedAction: 'search_required',
      };
    }
  }

  // Check for video queries
  for (const pattern of videoPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'video',
        confidence: 0.85,
        recommendedAction: 'video_search',
      };
    }
  }

  // Check for complex queries
  for (const pattern of complexPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'complex',
        confidence: 0.8,
        recommendedAction: 'full_search',
      };
    }
  }

  // Default classification based on query length and complexity
  const wordCount = lowerQuery.split(/\s+/).length;
  const hasQuestionWords = /\b(what|who|when|where|why|how)\b/.test(lowerQuery);

  if (wordCount <= 4 && hasQuestionWords) {
    return {
      isSimple: true,
      queryType: 'simple',
      confidence: 0.7,
      recommendedAction: 'direct_answer',
    };
  }

  return {
    isSimple: false,
    queryType: 'unknown',
    confidence: 0.6,
    recommendedAction: 'llm_classify',
  };
};

/**
 * Helper function to update queries with current year and date for time-sensitive searches
 */
export const updateQueryWithCurrentYear = (query) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 0-indexed, so add 1
  const currentDay = now.getDate();
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Get current date strings in different formats
  const currentMonthName = now.toLocaleString('default', { month: 'long' });
  const currentMonthShort = now.toLocaleString('default', { month: 'short' });
  const currentDateFormatted = `${currentMonthName} ${currentDay}, ${currentYear}`;
  const todayFormatted = `today ${currentDateFormatted}`;

  const previousYears = [
    currentYear - 1,
    currentYear - 2,
    currentYear - 3,
    currentYear - 4,
    currentYear - 5,
  ];
  const previousMonths = [];

  // Generate previous months for the current year
  for (let i = 1; i <= 3; i++) {
    const prevDate = new Date(now);
    prevDate.setMonth(now.getMonth() - i);
    previousMonths.push({
      year: prevDate.getFullYear(),
      month: prevDate.getMonth() + 1,
      monthName: prevDate.toLocaleString('default', { month: 'long' }),
      monthShort: prevDate.toLocaleString('default', { month: 'short' }),
    });
  }

  let updatedQuery = query;

  // 1. Update outdated years
  previousYears.forEach((year) => {
    const patterns = [
      // Basic year patterns
      new RegExp(
        `\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming|next|when|match|today|now|current))`,
        'gi'
      ),
      new RegExp(
        `\\b(schedule|game|season|event|news|latest|upcoming|next|when|match|today|now|current)\\s+${year}\\b`,
        'gi'
      ),
      new RegExp(
        `\\b${year}\\s+(schedule|game|season|event|news|latest|upcoming|next|when|match|today|now|current)\\b`,
        'gi'
      ),
      // Sports specific patterns
      new RegExp(`\\b${year}[-/]\\d{2}\\b`, 'gi'), // Match 2023-24 season format
      new RegExp(`\\b\\d{2}[-/]${year}\\b`, 'gi'), // Match 23-2024 season format
      // Date formats with outdated years
      new RegExp(`\\b${year}[-/]\\d{1,2}[-/]\\d{1,2}\\b`, 'gi'), // YYYY-MM-DD or YYYY/MM/DD
      new RegExp(`\\b\\d{1,2}[-/]\\d{1,2}[-/]${year}\\b`, 'gi'), // MM/DD/YYYY or DD/MM/YYYY
    ];

    patterns.forEach((pattern) => {
      updatedQuery = updatedQuery.replace(pattern, (match) => {
        return match.replace(year.toString(), currentYear.toString());
      });
    });
  });

  // 2. Update relative time references to be more specific
  const timeReplacements = [
    // Today/now references
    { pattern: /\b(today|now)\b(?!\s+\d{4})/gi, replacement: todayFormatted },
    {
      pattern: /\bcurrent\s+(month|week|day)\b/gi,
      replacement: `current $1 ${currentMonthName} ${currentYear}`,
    },
    {
      pattern: /\bthis\s+(month|week|year)\b/gi,
      replacement: `this $1 ${currentMonthName} ${currentYear}`,
    },
    {
      pattern: /\blatest\s+(news|updates|information)\b/gi,
      replacement: `latest $1 ${currentMonthName} ${currentYear}`,
    },

    // Recent time references
    {
      pattern: /\brecent\b(?!\s+\d{4})/gi,
      replacement: `recent ${currentYear}`,
    },
    {
      pattern: /\bupcoming\b(?!\s+\d{4})/gi,
      replacement: `upcoming ${currentYear}`,
    },
    {
      pattern: /\bnext\s+(week|month)\b(?!\s+\d{4})/gi,
      replacement: `next $1 ${currentYear}`,
    },

    // Yesterday/tomorrow references
    {
      pattern: /\byesterday\b/gi,
      replacement: `yesterday ${currentDateFormatted}`,
    },
    {
      pattern: /\btomorrow\b/gi,
      replacement: `tomorrow ${currentDateFormatted}`,
    },
  ];

  timeReplacements.forEach(({ pattern, replacement }) => {
    updatedQuery = updatedQuery.replace(pattern, replacement);
  });

  // 3. Update outdated month references
  previousMonths.forEach(({ year, monthName, monthShort }) => {
    if (year < currentYear) {
      const monthPatterns = [
        new RegExp(`\\b${monthName}\\s+${year}\\b`, 'gi'),
        new RegExp(`\\b${monthShort}\\s+${year}\\b`, 'gi'),
        new RegExp(`\\b${year}\\s+${monthName}\\b`, 'gi'),
        new RegExp(`\\b${year}\\s+${monthShort}\\b`, 'gi'),
      ];

      monthPatterns.forEach((pattern) => {
        updatedQuery = updatedQuery.replace(pattern, (match) => {
          return match.replace(year.toString(), currentYear.toString());
        });
      });
    }
  });

  // 4. Add current context for time-sensitive keywords
  const timeSensitiveKeywords = [
    'next game',
    'upcoming game',
    'when is',
    'schedule',
    'next match',
    'latest news',
    'current events',
    'breaking news',
    "today's",
    'stock price',
    'weather',
    'forecast',
    'happening now',
  ];

  const hasTimeSensitiveKeyword = timeSensitiveKeywords.some((keyword) =>
    updatedQuery.toLowerCase().includes(keyword.toLowerCase())
  );

  // Add current year/date context if not already present
  if (hasTimeSensitiveKeyword) {
    const hasYearContext = /\b\d{4}\b/.test(updatedQuery);
    const hasDateContext =
      /\b(today|now|current|latest|recent|upcoming|next)\s+\d{4}\b/i.test(
        updatedQuery
      );

    if (!hasYearContext && !hasDateContext) {
      updatedQuery += ` ${currentYear}`;
    }
  }

  // 5. Special handling for "latest" or "current" queries
  if (
    /\b(latest|current|newest|most recent)\b/i.test(updatedQuery) &&
    !/\b\d{4}\b/.test(updatedQuery)
  ) {
    updatedQuery += ` ${currentYear}`;
  }

  // Log the transformation if there were changes
  if (updatedQuery !== query) {
    console.log(`Query updated for current date context:`);
    console.log(`  Original: "${query}"`);
    console.log(`  Updated:  "${updatedQuery}"`);
    console.log(`  Context:  ${currentDateFormatted}`);
    updatedQuery = `${updatedQuery} For context today is: ${currentDateFormatted}`;

    console.log(`Final contextualized query: "${updatedQuery}"`);
  }

  return updatedQuery;
};
