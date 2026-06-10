import { describe, it, expect } from 'vitest';
import { createSummarizerState } from './state';

describe('createSummarizerState', () => {
  it('should be a function', () => {
    expect(typeof createSummarizerState).toBe('function');
  });

  it('should return an object', () => {
    const state = createSummarizerState();
    expect(typeof state).toBe('object');
    expect(state).not.toBeNull();
  });

  it('should return an object with the correct initial properties', () => {
    const state = createSummarizerState();

    expect(state).toHaveProperty('user_input');
    expect(state).toHaveProperty('content');
    expect(state).toHaveProperty('summary');
    expect(state).toHaveProperty('history');
    expect(state).toHaveProperty('isFilePassed');
  });

  it('should initialize user_input with a value property set to null', () => {
    const state = createSummarizerState();
    expect(state.user_input).toEqual({ value: null });
  });

  it('should initialize content with a value property set to null', () => {
    const state = createSummarizerState();
    expect(state.content).toEqual({ value: null });
  });

  it('should initialize summary with a value property set to null', () => {
    const state = createSummarizerState();
    expect(state.summary).toEqual({ value: null });
  });

  it('should initialize isFilePassed with a value property set to null', () => {
    const state = createSummarizerState();
    expect(state.isFilePassed).toEqual({ value: null });
  });

  it('should initialize history with a value property that is a function and a default property that is a function', () => {
    const state = createSummarizerState();
    expect(state.history).toHaveProperty('value');
    expect(typeof state.history.value).toBe('function');
    expect(state.history).toHaveProperty('default');
    expect(typeof state.history.default).toBe('function');
  });

  it('history.default() should return an empty array', () => {
    const state = createSummarizerState();
    expect(state.history.default()).toEqual([]);
  });

  it('history.value should correctly concatenate two arrays', () => {
    const state = createSummarizerState();
    const arr1 = [1, 2];
    const arr2 = [3, 4];
    expect(state.history.value(arr1, arr2)).toEqual([1, 2, 3, 4]);
    expect(state.history.value([], ['item'])).toEqual(['item']);
    expect(state.history.value(['item'], [])).toEqual(['item']);
  });

  it('should return independent state objects on multiple calls', () => {
    const state1 = createSummarizerState();
    const state2 = createSummarizerState();

    expect(state1).not.toBe(state2);
    expect(state1.user_input).not.toBe(state2.user_input);
    expect(state1.history).not.toBe(state2.history);

    state1.user_input.value = 'test input';
    expect(state2.user_input.value).toBeNull();
  });
});