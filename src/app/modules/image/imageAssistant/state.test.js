import { describe, it, expect } from 'vitest';
import { graphState } from './state.js';

describe('graphState definition', () => {
  it('should have the correct structure and keys', () => {
    const expectedKeys = [
      'initialPrompt',
      'refinedPrompt',
      'questions',
      'conversationHistory',
      'userResponse',
      'finalPrompt',
      'imageUrl',
      'responseMessage'
    ];
    expect(Object.keys(graphState)).toEqual(expectedKeys);
  });

  describe('refinedPrompt', () => {
    it('should have a default function returning an empty string', () => {
      expect(graphState.refinedPrompt.default()).toBe('');
    });

    it('should have a value function that returns the new value (y)', () => {
      const x = 'old prompt';
      const y = 'new prompt';
      expect(graphState.refinedPrompt.value(x, y)).toBe(y);
    });
  });

  describe('conversationHistory', () => {
    it('should have a default function returning an empty array', () => {
      expect(graphState.conversationHistory.default()).toEqual([]);
    });

    it('should have a value function that concatenates the new array to the old array', () => {
      const x = ['message 1', 'message 2'];
      const y = ['message 3'];
      expect(graphState.conversationHistory.value(x, y)).toEqual(['message 1', 'message 2', 'message 3']);
    });
  });

  describe('static properties', () => {
    const staticKeys = [
      'initialPrompt',
      'questions',
      'userResponse',
      'finalPrompt',
      'imageUrl',
      'responseMessage'
    ];

    staticKeys.forEach(key => {
      it(`should have ${key} with value set to null`, () => {
        expect(graphState[key]).toEqual({ value: null });
      });
    });
  });
});