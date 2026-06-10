import { describe, it, expect } from 'vitest';
import { codeAssistantState } from './state.js';

describe('codeAssistantState', () => {
  describe('Context and Static Properties', () => {
    it('should define user and tenant context properties with a null initial value', () => {
      expect(codeAssistantState.userId).toEqual({ value: null });
      expect(codeAssistantState.userRole).toEqual({ value: null });
      expect(codeAssistantState.workspaceId).toEqual({ value: null });
    });

    it('should define conversation state properties with a null initial value', () => {
      expect(codeAssistantState.conversationId).toEqual({ value: null });
      expect(codeAssistantState.userInput).toEqual({ value: null });
      expect(codeAssistantState.intent).toEqual({ value: null });
      expect(codeAssistantState.response).toEqual({ value: null });
    });

    it('should define error handling property with a null initial value', () => {
      expect(codeAssistantState.error).toEqual({ value: null });
    });

    it('should not contain any logic for role-based access checks directly, only placeholders for context', () => {
      // This test serves as a documentation of the state's purpose.
      // The state object holds context like `userRole` and `workspaceId`,
      // but the enforcement logic must exist elsewhere in the application (e.g., graph nodes, middleware).
      expect(typeof codeAssistantState.userRole.value).not.toBe('function');
      expect(typeof codeAssistantState.workspaceId.value).not.toBe('function');
    });
  });

  describe('history', () => {
    it('should have a default function that returns an empty array', () => {
      expect(codeAssistantState.history.default()).toEqual([]);
    });

    it('should have a value function that concatenates new entries to the existing history', () => {
      const existingHistory = [{ role: 'user', content: 'Hello' }];
      const newEntry = [{ role: 'assistant', content: 'Hi there!' }];
      const result = codeAssistantState.history.value(existingHistory, newEntry);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should correctly concatenate to an empty initial history', () => {
      const initialHistory = [];
      const newEntry = [{ role: 'user', content: 'First message' }];
      const result = codeAssistantState.history.value(initialHistory, newEntry);
      expect(result).toEqual([{ role: 'user', content: 'First message' }]);
    });

    it('should return a new array instance (immutability)', () => {
      const existingHistory = [{ role: 'user', content: 'Hello' }];
      const newEntry = [{ role: 'assistant', content: 'Hi there!' }];
      const result = codeAssistantState.history.value(existingHistory, newEntry);
      expect(result).not.toBe(existingHistory);
    });
  });

  describe('usage', () => {
    it('should have a default function that returns a zeroed usage object', () => {
      const defaultUsage = codeAssistantState.usage.default();
      expect(defaultUsage).toEqual({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });
    });

    it('should have a value function that correctly sums new usage with existing usage', () => {
      const existingUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      };
      const newUsage = {
        prompt_tokens: 20,
        completion_tokens: 30,
        total_tokens: 50,
      };
      const result = codeAssistantState.usage.value(existingUsage, newUsage);
      expect(result).toEqual({
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
      });
    });

    it('should correctly add usage to an initial (default) state', () => {
      const initialUsage = codeAssistantState.usage.default();
      const newUsage = {
        prompt_tokens: 75,
        completion_tokens: 125,
        total_tokens: 200,
      };
      const result = codeAssistantState.usage.value(initialUsage, newUsage);
      expect(result).toEqual({
        prompt_tokens: 75,
        completion_tokens: 125,
        total_tokens: 200,
      });
    });

    it('should handle cases where existing usage properties are missing, null, or undefined', () => {
      const existingUsage = { prompt_tokens: 50 }; // missing completion and total
      const newUsage = {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      };
      const result = codeAssistantState.usage.value(existingUsage, newUsage);
      expect(result).toEqual({
        prompt_tokens: 60,
        completion_tokens: 20,
        total_tokens: 30,
      });
    });

    it('should handle cases where new usage properties are missing, null, or undefined', () => {
      const existingUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      };
      const newUsage = { prompt_tokens: 10 }; // missing completion and total
      const result = codeAssistantState.usage.value(existingUsage, newUsage);
      expect(result).toEqual({
        prompt_tokens: 110,
        completion_tokens: 50,
        total_tokens: 150,
      });
    });

    it('should handle empty or partially empty objects gracefully, resulting in a sum of defined values', () => {
      const existingUsage = {};
      const newUsage = { total_tokens: 100 };
      const result = codeAssistantState.usage.value(existingUsage, newUsage);
      expect(result).toEqual({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 100,
      });
    });

    it('should return a new object instance (immutability)', () => {
      const existingUsage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
      const newUsage = { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 };
      const result = codeAssistantState.usage.value(existingUsage, newUsage);
      expect(result).not.toBe(existingUsage);
      expect(result).not.toBe(newUsage);
    });
  });
});