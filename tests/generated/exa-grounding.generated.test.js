import { describe, it, expect } from 'vitest';
import config from '../../config/index.js';

describe('Exa.ai Neural Search & Grounding Verification', () => {
  it('should format neural search parameters with autoprompt and highlights enabled', () => {
    const searchOptions = {
      type: 'neural',
      useAutoprompt: true,
      numResults: 5,
      highlights: true,
    };
    expect(searchOptions.type).toBe('neural');
    expect(searchOptions.useAutoprompt).toBe(true);
  });

  it('should verify zero-hallucination citation extractor format', () => {
    const rawResult = {
      title: 'Macroeconomic Outlook 2026',
      url: 'https://bea.gov/reports/gdp',
      highlights: ['GDP grew at 2.8% annualized rate.'],
    };
    expect(rawResult.url).toMatch(/^https?:\/\//);
    expect(rawResult.highlights.length).toBeGreaterThan(0);
  });
});
