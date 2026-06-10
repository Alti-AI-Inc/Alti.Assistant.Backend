import { describe, it, expect } from 'vitest';
import {
  sportsArbitrageScanner,
  sportsParlayArchitect,
  sportsSharpMoneyAnalyst,
  sportsPlayerPropsPredictor,
  sportsValueBettingQuant,
  sportsDFSExpert,
  sportsLiveOddsOrchestrator,
  sportsFuturesSpeculator
} from './predictiondata.agents.js';

const allAgents = [
  sportsArbitrageScanner,
  sportsParlayArchitect,
  sportsSharpMoneyAnalyst,
  sportsPlayerPropsPredictor,
  sportsValueBettingQuant,
  sportsDFSExpert,
  sportsLiveOddsOrchestrator,
  sportsFuturesSpeculator
];

describe('PredictionData Sports Intelligence Agents Config', () => {
  it('should export exactly 8 agents', () => {
    expect(allAgents).toHaveLength(8);
  });

  it('should ensure all agents conform to the SportsAgent schema structure', () => {
    allAgents.forEach((agent) => {
      expect(agent).toBeDefined();
      expect(typeof agent).toBe('object');
      
      expect(agent).toHaveProperty('id');
      expect(typeof agent.id).toBe('string');
      expect(agent.id.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('name');
      expect(typeof agent.name).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('description');
      expect(typeof agent.description).toBe('string');
      expect(agent.description.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('systemInstruction');
      expect(typeof agent.systemInstruction).toBe('string');
      expect(agent.systemInstruction.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('model');
      expect(agent.model).toBe('gemini-2.0-flash');

      expect(agent).toHaveProperty('tools');
      expect(Array.isArray(agent.tools)).toBe(true);
      expect(agent.tools).toHaveLength(0); // Currently empty for these agents

      expect(agent).toHaveProperty('keywords');
      expect(Array.isArray(agent.keywords)).toBe(true);
      expect(agent.keywords.length).toBeGreaterThan(0);
    });
  });

  it('should verify all agents require PredictionData.io source citation in system instructions', () => {
    allAgents.forEach((agent) => {
      expect(agent.systemInstruction).toContain('[Source: PredictionData.io]');
    });
  });

  describe('sportsArbitrageScanner specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsArbitrageScanner.id).toBe('sports_arbitrage_scanner');
      expect(sportsArbitrageScanner.name).toBe('Sports Arbitrage Scanner');
      expect(sportsArbitrageScanner.keywords).toContain('arbitrage');
      expect(sportsArbitrageScanner.keywords).toContain('surebets');
      expect(sportsArbitrageScanner.systemInstruction).toContain('STAKE ALLOCATION MATRIX');
      expect(sportsArbitrageScanner.systemInstruction).toContain('MARKET INTEGRITY AUDIT');
    });
  });

  describe('sportsParlayArchitect specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsParlayArchitect.id).toBe('sports_parlay_architect');
      expect(sportsParlayArchitect.name).toBe('Sports Parlay Architect');
      expect(sportsParlayArchitect.keywords).toContain('parlay');
      expect(sportsParlayArchitect.keywords).toContain('accumulator');
      expect(sportsParlayArchitect.systemInstruction).toContain('COMBINED MULTIPLIER');
      expect(sportsParlayArchitect.systemInstruction).toContain('HEDGING BLUEPRINT');
    });
  });

  describe('sportsSharpMoneyAnalyst specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsSharpMoneyAnalyst.id).toBe('sports_sharp_money_analyst');
      expect(sportsSharpMoneyAnalyst.name).toBe('Sports Sharp Money Analyst');
      expect(sportsSharpMoneyAnalyst.keywords).toContain('sharp money');
      expect(sportsSharpMoneyAnalyst.keywords).toContain('rlm');
      expect(sportsSharpMoneyAnalyst.systemInstruction).toContain('REVERSE LINE MOVEMENT');
      expect(sportsSharpMoneyAnalyst.systemInstruction).toContain('Pinnacle');
    });
  });

  describe('sportsPlayerPropsPredictor specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsPlayerPropsPredictor.id).toBe('sports_player_props_predictor');
      expect(sportsPlayerPropsPredictor.name).toBe('Sports Player Props Predictor');
      expect(sportsPlayerPropsPredictor.keywords).toContain('player props');
      expect(sportsPlayerPropsPredictor.keywords).toContain('prop bet');
      expect(sportsPlayerPropsPredictor.systemInstruction).toContain('AUTO-ROUTING CLEARITY');
      expect(sportsPlayerPropsPredictor.systemInstruction).toContain('LINE SHOPPING');
    });
  });

  describe('sportsValueBettingQuant specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsValueBettingQuant.id).toBe('sports_value_betting_quant');
      expect(sportsValueBettingQuant.name).toBe('Sports Value Betting Quant');
      expect(sportsValueBettingQuant.keywords).toContain('value bets');
      expect(sportsValueBettingQuant.keywords).toContain('kelly criterion');
      expect(sportsValueBettingQuant.systemInstruction).toContain('EXPECTED VALUE EDGE');
      expect(sportsValueBettingQuant.systemInstruction).toContain('KELLY CRITERION BET SIZING');
    });
  });

  describe('sportsDFSExpert specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsDFSExpert.id).toBe('sports_dfs_expert');
      expect(sportsDFSExpert.name).toBe('Sports DFS Expert');
      expect(sportsDFSExpert.keywords).toContain('prizepicks');
      expect(sportsDFSExpert.keywords).toContain('underdog');
      expect(sportsDFSExpert.systemInstruction).toContain('PLATFORM PRICE ARBITRAGE');
      expect(sportsDFSExpert.systemInstruction).toContain('SLIP DESIGN');
    });
  });

  describe('sportsLiveOddsOrchestrator specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsLiveOddsOrchestrator.id).toBe('sports_live_odds_orchestrator');
      expect(sportsLiveOddsOrchestrator.name).toBe('Sports Live Odds Orchestrator');
      expect(sportsLiveOddsOrchestrator.keywords).toContain('live odds');
      expect(sportsLiveOddsOrchestrator.keywords).toContain('in-play');
      expect(sportsLiveOddsOrchestrator.systemInstruction).toContain('DYNAMIC PRICE ADJUSTMENT');
      expect(sportsLiveOddsOrchestrator.systemInstruction).toContain('LIVE HEDGING ENGINE');
    });
  });

  describe('sportsFuturesSpeculator specific assertions', () => {
    it('should have correct metadata and keywords', () => {
      expect(sportsFuturesSpeculator.id).toBe('sports_futures_speculator');
      expect(sportsFuturesSpeculator.name).toBe('Sports Futures Speculator');
      expect(sportsFuturesSpeculator.keywords).toContain('futures odds');
      expect(sportsFuturesSpeculator.keywords).toContain('championship odds');
      expect(sportsFuturesSpeculator.systemInstruction).toContain('OUTRIGHT FAVORITES');
      expect(sportsFuturesSpeculator.systemInstruction).toContain('PORTFOLIO OUTRIGHT STRATEGY');
    });
  });
});