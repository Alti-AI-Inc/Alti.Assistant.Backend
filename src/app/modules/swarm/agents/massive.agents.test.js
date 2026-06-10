import { describe, it, expect } from 'vitest';
import {
  massiveEquityAnalyst,
  massiveOptionsStrategist,
  massiveCryptoAnalyst,
  massiveForexTrader,
  massiveMacroEconomist,
  massiveTechnicalChartist,
  massiveFundamentalsAudit,
  massivePortfolioAdvisor
} from './massive.agents.js';

const agents = [
  { instance: massiveEquityAnalyst, expectedId: 'massive_equity_analyst', expectedName: 'Massive Equity Analyst', keyKeyword: 'stock analysis' },
  { instance: massiveOptionsStrategist, expectedId: 'massive_options_strategist', expectedName: 'Massive Options Strategist', keyKeyword: 'options chain' },
  { instance: massiveCryptoAnalyst, expectedId: 'massive_crypto_analyst', expectedName: 'Massive Crypto Analyst', keyKeyword: 'bitcoin analysis' },
  { instance: massiveForexTrader, expectedId: 'massive_forex_trader', expectedName: 'Massive Forex Trader', keyKeyword: 'forex analysis' },
  { instance: massiveMacroEconomist, expectedId: 'massive_macro_economist', expectedName: 'Massive Macro Economist', keyKeyword: 'inflation data' },
  { instance: massiveTechnicalChartist, expectedId: 'massive_technical_chartist', expectedName: 'Massive Technical Chartist', keyKeyword: 'rsi' },
  { instance: massiveFundamentalsAudit, expectedId: 'massive_fundamentals_audit', expectedName: 'Massive Fundamentals Auditor', keyKeyword: 'income statement' },
  { instance: massivePortfolioAdvisor, expectedId: 'massive_portfolio_advisor', expectedName: 'Massive Portfolio Advisor', keyKeyword: 'portfolio' }
];

describe('Massive Financial Intelligence Agents Configuration', () => {
  it('should export exactly 8 agents', () => {
    expect(agents).toHaveLength(8);
  });

  describe('Structural Integrity Tests', () => {
    agents.forEach(({ instance, expectedId }) => {
      it(`should have valid structure for agent: ${expectedId}`, () => {
        expect(instance).toBeDefined();
        expect(instance).toBeTypeOf('object');

        // ID validation
        expect(instance.id).toBeTypeOf('string');
        expect(instance.id).toBe(expectedId);

        // Name validation
        expect(instance.name).toBeTypeOf('string');
        expect(instance.name.length).toBeGreaterThan(0);

        // Description validation
        expect(instance.description).toBeTypeOf('string');
        expect(instance.description.length).toBeGreaterThan(0);

        // System Instruction validation
        expect(instance.systemInstruction).toBeTypeOf('string');
        expect(instance.systemInstruction.length).toBeGreaterThan(0);
        expect(instance.systemInstruction).toContain('[Source: Massive.com]');

        // Model validation
        expect(instance.model).toBe('gemini-2.0-flash');

        // Tools validation
        expect(Array.isArray(instance.tools)).toBe(true);
        expect(instance.tools).toHaveLength(0);

        // Keywords validation
        expect(Array.isArray(instance.keywords)).toBe(true);
        expect(instance.keywords.length).toBeGreaterThan(0);
        instance.keywords.forEach(keyword => {
          expect(keyword).toBeTypeOf('string');
        });
      });
    });
  });

  describe('Specific Agent Content Validation', () => {
    agents.forEach(({ instance, expectedName, keyKeyword }) => {
      it(`should contain correct metadata and keywords for ${expectedName}`, () => {
        expect(instance.name).toBe(expectedName);
        expect(instance.keywords).toContain(keyKeyword);
      });
    });

    it('should verify massiveEquityAnalyst contains specific instructions', () => {
      expect(massiveEquityAnalyst.systemInstruction).toContain('FUNDAMENTALS FIRST');
      expect(massiveEquityAnalyst.systemInstruction).toContain('TECHNICAL OVERLAY');
      expect(massiveEquityAnalyst.systemInstruction).toContain('NEWS CATALYST');
    });

    it('should verify massiveOptionsStrategist contains specific instructions', () => {
      expect(massiveOptionsStrategist.systemInstruction).toContain('GREEKS INTERPRETATION');
      expect(massiveOptionsStrategist.systemInstruction).toContain('OPEN INTEREST & VOLUME');
      expect(massiveOptionsStrategist.systemInstruction).toContain('STRATEGY RECOMMENDATIONS');
    });

    it('should verify massiveCryptoAnalyst contains specific instructions', () => {
      expect(massiveCryptoAnalyst.systemInstruction).toContain('PRICE ACTION');
      expect(massiveCryptoAnalyst.systemInstruction).toContain('TECHNICAL SIGNALS');
      expect(massiveCryptoAnalyst.systemInstruction).toContain('DOMINANCE CONTEXT');
    });

    it('should verify massiveForexTrader contains specific instructions', () => {
      expect(massiveForexTrader.systemInstruction).toContain('PAIR STRUCTURE');
      expect(massiveForexTrader.systemInstruction).toContain('MACRO DRIVERS');
      expect(massiveForexTrader.systemInstruction).toContain('CARRY TRADE');
    });

    it('should verify massiveMacroEconomist contains specific instructions', () => {
      expect(massiveMacroEconomist.systemInstruction).toContain('INFLATION (CPI/PCE)');
      expect(massiveMacroEconomist.systemInstruction).toContain('YIELD CURVE');
      expect(massiveMacroEconomist.systemInstruction).toContain('MARKET IMPACT MATRIX');
    });

    it('should verify massiveTechnicalChartist contains specific instructions', () => {
      expect(massiveTechnicalChartist.systemInstruction).toContain('SIGNAL CONFLUENCE');
      expect(massiveTechnicalChartist.systemInstruction).toContain('RSI INTERPRETATION');
      expect(massiveTechnicalChartist.systemInstruction).toContain('SIGNAL SCORING');
    });

    it('should verify massiveFundamentalsAudit contains specific instructions', () => {
      expect(massiveFundamentalsAudit.systemInstruction).toContain('INCOME STATEMENT AUDIT');
      expect(massiveFundamentalsAudit.systemInstruction).toContain('BALANCE SHEET AUDIT');
      expect(massiveFundamentalsAudit.systemInstruction).toContain('VALUATION MULTIPLES');
    });

    it('should verify massivePortfolioAdvisor contains specific instructions', () => {
      expect(massivePortfolioAdvisor.systemInstruction).toContain('CROSS-ASSET CORRELATION');
      expect(massivePortfolioAdvisor.systemInstruction).toContain('SECTOR CONCENTRATION');
      expect(massivePortfolioAdvisor.systemInstruction).toContain('REBALANCING SIGNALS');
    });
  });
});