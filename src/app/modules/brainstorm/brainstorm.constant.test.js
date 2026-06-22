import { describe, it, expect } from 'vitest';
import {
  BRAINSTORM_CONFIG,
  BRAINSTORM_TYPES,
  TECHNIQUES,
  PERSPECTIVES,
  DEPTH_LEVELS,
  FOCUS_AREAS,
  BRAINSTORM_INTENTS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CLARIFICATION_SUGGESTIONS,
  TECHNIQUE_DESCRIPTIONS,
  COMPLEXITY_LEVELS,
  OUTPUT_FORMATS,
} from './brainstorm.constant.js';

describe('brainstorm.constant.js', () => {
  describe('Constant Objects Integrity', () => {
    it('should have BRAINSTORM_CONFIG defined with correct keys and types', () => {
      expect(BRAINSTORM_CONFIG).toBeDefined();
      expect(typeof BRAINSTORM_CONFIG.MODEL).toBe('string');
      expect(typeof BRAINSTORM_CONFIG.TEMPERATURE).toBe('number');
      expect(typeof BRAINSTORM_CONFIG.MAX_OUTPUT_TOKENS).toBe('number');
      expect(typeof BRAINSTORM_CONFIG.MAX_IDEA_LENGTH).toBe('number');
      expect(typeof BRAINSTORM_CONFIG.MIN_IDEA_LENGTH).toBe('number');
    });

    it('should have all constant objects defined', () => {
      expect(BRAINSTORM_TYPES).toBeDefined();
      expect(TECHNIQUES).toBeDefined();
      expect(PERSPECTIVES).toBeDefined();
      expect(DEPTH_LEVELS).toBeDefined();
      expect(FOCUS_AREAS).toBeDefined();
      expect(BRAINSTORM_INTENTS).toBeDefined();
      expect(CONVERSATION_CATEGORY).toBe('brainstorm');
      expect(CONVERSATION_MODEL).toBe('gemini-3.5-flash');
      expect(DEFAULT_PARAMS).toBeDefined();
      expect(SYSTEM_PROMPTS).toBeDefined();
      expect(RESPONSE_MESSAGES).toBeDefined();
      expect(CLARIFICATION_SUGGESTIONS).toBeDefined();
      expect(TECHNIQUE_DESCRIPTIONS).toBeDefined();
      expect(COMPLEXITY_LEVELS).toBeDefined();
      expect(OUTPUT_FORMATS).toBeDefined();
    });

    it('should have values that are non-empty strings in most constant objects', () => {
      const constantsToCheck = [
        BRAINSTORM_TYPES,
        TECHNIQUES,
        PERSPECTIVES,
        DEPTH_LEVELS,
        FOCUS_AREAS,
        BRAINSTORM_INTENTS,
        RESPONSE_MESSAGES,
        COMPLEXITY_LEVELS,
        OUTPUT_FORMATS,
      ];
      constantsToCheck.forEach(obj => {
        Object.values(obj).forEach(value => {
          expect(typeof value).toBe('string');
          expect(value.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have a description for every defined technique', () => {
      const techniqueKeys = Object.values(TECHNIQUES);
      techniqueKeys.forEach(key => {
        expect(TECHNIQUE_DESCRIPTIONS).toHaveProperty(key);
        expect(TECHNIQUE_DESCRIPTIONS[key]).toHaveProperty('name');
        expect(TECHNIQUE_DESCRIPTIONS[key]).toHaveProperty('description');
        expect(TECHNIQUE_DESCRIPTIONS[key]).toHaveProperty('useCase');
      });
    });

    it('DEFAULT_PARAMS should use values from other constants', () => {
      expect(DEFAULT_PARAMS.brainstormType).toBe(BRAINSTORM_TYPES.GENERAL);
      expect(DEFAULT_PARAMS.depth).toBe(DEPTH_LEVELS.STANDARD);
      expect(DEFAULT_PARAMS.technique).toBe(TECHNIQUES.FREE_ASSOCIATION);
      expect(DEFAULT_PARAMS.perspectives).toEqual([
        PERSPECTIVES.BUSINESS,
        PERSPECTIVES.USER_CENTRIC,
      ]);
      expect(DEFAULT_PARAMS.ideaCount).toHaveProperty(DEPTH_LEVELS.QUICK);
      expect(DEFAULT_PARAMS.ideaCount).toHaveProperty(DEPTH_LEVELS.STANDARD);
      expect(DEFAULT_PARAMS.ideaCount).toHaveProperty(DEPTH_LEVELS.DEEP);
      expect(DEFAULT_PARAMS.ideaCount).toHaveProperty(
        DEPTH_LEVELS.COMPREHENSIVE
      );
    });
  });

  describe('SYSTEM_PROMPTS', () => {
    it('should have defined string prompts for non-function properties', () => {
      expect(typeof SYSTEM_PROMPTS.MAIN_ASSISTANT).toBe('string');
      expect(SYSTEM_PROMPTS.MAIN_ASSISTANT.length).toBeGreaterThan(0);
      expect(typeof SYSTEM_PROMPTS.INTENT_ANALYZER).toBe('string');
      expect(SYSTEM_PROMPTS.INTENT_ANALYZER.length).toBeGreaterThan(0);
      expect(typeof SYSTEM_PROMPTS.IDEA_ANALYZER).toBe('string');
      expect(SYSTEM_PROMPTS.IDEA_ANALYZER.length).toBeGreaterThan(0);
      expect(typeof SYSTEM_PROMPTS.IDEA_REFINER).toBe('string');
      expect(SYSTEM_PROMPTS.IDEA_REFINER.length).toBeGreaterThan(0);
    });

    describe('IDEA_GENERATOR function', () => {
      const baseArgs = {
        type: BRAINSTORM_TYPES.PRODUCT_IDEA,
        depth: DEPTH_LEVELS.STANDARD,
        technique: TECHNIQUES.SCAMPER,
        perspectives: [PERSPECTIVES.TECHNICAL, PERSPECTIVES.FINANCIAL],
        ideaCount: 15,
      };

      it('should be a function', () => {
        expect(typeof SYSTEM_PROMPTS.IDEA_GENERATOR).toBe('function');
      });

      it('should generate a prompt with all required parameters', () => {
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          baseArgs.type,
          baseArgs.depth,
          baseArgs.technique,
          baseArgs.perspectives,
          baseArgs.ideaCount
        );

        expect(prompt).toContain(
          `**Brainstorming Goal:** Generate ideas for a new "${baseArgs.type}"`
        );
        expect(prompt).toContain(
          `**Technique to Apply:** ${TECHNIQUE_DESCRIPTIONS[baseArgs.technique].name}`
        );
        expect(prompt).toContain(
          `**Description:** ${TECHNIQUE_DESCRIPTIONS[baseArgs.technique].description}`
        );
        expect(prompt).toContain(
          `**Number of Ideas to Generate:** Approximately ${baseArgs.ideaCount} ideas.`
        );
        expect(prompt).toContain(`**Depth Level:** ${baseArgs.depth}`);
        expect(prompt).toContain(
          `**Analysis Perspectives:** ${baseArgs.perspectives.join(', ')}`
        );
        expect(prompt).toContain(
          `Each idea must be detailed, actionable, and between ${BRAINSTORM_CONFIG.MIN_IDEA_LENGTH} and ${BRAINSTORM_CONFIG.MAX_IDEA_LENGTH} characters long.`
        );
        expect(prompt).not.toContain('**Primary Focus Areas:**');
        expect(prompt).not.toContain('**User-defined Constraints:**');
      });

      it('should include focus areas when provided', () => {
        const focusAreas = [FOCUS_AREAS.INNOVATION, FOCUS_AREAS.SCALABILITY];
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          baseArgs.type,
          baseArgs.depth,
          baseArgs.technique,
          baseArgs.perspectives,
          baseArgs.ideaCount,
          focusAreas
        );

        expect(prompt).toContain(
          `**Primary Focus Areas:** ${focusAreas.join(', ')}.`
        );
        expect(prompt).not.toContain('**User-defined Constraints:**');
      });

      it('should include constraints when provided', () => {
        const constraints = 'Must be implementable with a $50k budget.';
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          baseArgs.type,
          baseArgs.depth,
          baseArgs.technique,
          baseArgs.perspectives,
          baseArgs.ideaCount,
          [],
          constraints
        );

        expect(prompt).toContain(
          `**User-defined Constraints:** ${constraints}.`
        );
        expect(prompt).not.toContain('**Primary Focus Areas:**');
      });

      it('should include both focus areas and constraints when provided', () => {
        const focusAreas = [FOCUS_AREAS.PROFITABILITY];
        const constraints = 'Target audience is Gen Z.';
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          baseArgs.type,
          baseArgs.depth,
          baseArgs.technique,
          baseArgs.perspectives,
          baseArgs.ideaCount,
          focusAreas,
          constraints
        );

        expect(prompt).toContain(
          `**Primary Focus Areas:** ${focusAreas.join(', ')}.`
        );
        expect(prompt).toContain(
          `**User-defined Constraints:** ${constraints}.`
        );
      });

      it('should handle an unknown technique gracefully', () => {
        const unknownTechnique = 'unknown_technique';
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          baseArgs.type,
          baseArgs.depth,
          unknownTechnique,
          baseArgs.perspectives,
          baseArgs.ideaCount
        );

        expect(prompt).toContain(`**Technique to Apply:** ${unknownTechnique}`);
        expect(prompt).toContain(
          `**Description:** A standard brainstorming method.`
        );
      });

      it('should produce a consistent output for a given set of inputs (snapshot test)', () => {
        const focusAreas = [FOCUS_AREAS.MARKETABILITY, FOCUS_AREAS.USER_VALUE];
        const constraints = 'Must be eco-friendly and sustainable.';
        const prompt = SYSTEM_PROMPTS.IDEA_GENERATOR(
          BRAINSTORM_TYPES.MARKETING_CAMPAIGN,
          DEPTH_LEVELS.DEEP,
          TECHNIQUES.SIX_THINKING_HATS,
          [PERSPECTIVES.CREATIVE, PERSPECTIVES.COMPETITIVE],
          30,
          focusAreas,
          constraints
        );

        expect(prompt).toMatchSnapshot();
      });
    });
  });
});