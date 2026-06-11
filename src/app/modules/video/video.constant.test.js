import { describe, it, expect } from 'vitest';
import { VIDEO_ASSISTANT_CONSTANTS } from './video.constant.js';

describe('VIDEO_ASSISTANT_CONSTANTS', () => {
  it('should be a deeply frozen object', () => {
    // Check if the top-level object is frozen
    expect(Object.isFrozen(VIDEO_ASSISTANT_CONSTANTS)).toBe(true);

    // Check a nested object
    expect(Object.isFrozen(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS)).toBe(true);

    // Check a deeply nested object
    expect(Object.isFrozen(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.DURATIONS)).toBe(true);

    // Check a nested array
    expect(Object.isFrozen(VIDEO_ASSISTANT_CONSTANTS.FILE.ALLOWED_FORMATS)).toBe(true);
  });

  it('should prevent modification of top-level properties', () => {
    // Attempt to add a new property
    try {
      VIDEO_ASSISTANT_CONSTANTS.NEW_PROP = 'test';
    } catch (e) {
      // In strict mode, this will throw a TypeError.
      // We check the outcome regardless of mode.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.NEW_PROP).toBeUndefined();

    // Attempt to change an existing property
    const originalLimits = VIDEO_ASSISTANT_CONSTANTS.LIMITS;
    try {
      VIDEO_ASSISTANT_CONSTANTS.LIMITS = {};
    } catch (e) {
      // In strict mode, this will throw a TypeError.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.LIMITS).toBe(originalLimits);
    expect(VIDEO_ASSISTANT_CONSTANTS.LIMITS.MAX_CONVERSATION_LENGTH).toBe(50);
  });

  it('should prevent modification of nested properties', () => {
    // Attempt to change a nested property
    const originalDuration = VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.DURATIONS.SHORT;
    try {
      VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.DURATIONS.SHORT = 999;
    } catch (e) {
      // In strict mode, this will throw a TypeError.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.DURATIONS.SHORT).toBe(originalDuration);
    expect(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.DURATIONS.SHORT).not.toBe(999);

    // Attempt to add a new property to a nested object
    try {
      VIDEO_ASSISTANT_CONSTANTS.ERRORS.NEW_ERROR = 'A new error';
    } catch (e) {
      // In strict mode, this will throw a TypeError.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.ERRORS.NEW_ERROR).toBeUndefined();
  });

  it('should prevent modification of nested array elements', () => {
    const originalLength = VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES.length;
    // Attempt to add an element to the array
    try {
      VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES.push('video/new-type');
    } catch (e) {
      // In strict mode, this will throw a TypeError.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES.length).toBe(originalLength);

    // Attempt to change an existing element
    const originalMimeType = VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES[0];
    try {
      VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES[0] = 'changed';
    } catch (e) {
      // In strict mode, this will throw a TypeError.
    }
    expect(VIDEO_ASSISTANT_CONSTANTS.FILE.MIME_TYPES[0]).toBe(originalMimeType);
  });

  it('should contain expected constant values as a sanity check', () => {
    // This is not an exhaustive test of all values, but a check
    // to ensure the object structure is as expected and hasn't been malformed.
    expect(VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH).toBe(3);
    expect(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.ASPECT_RATIOS.LANDSCAPE).toBe('16:9');
    expect(VIDEO_ASSISTANT_CONSTANTS.FILE.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
    expect(VIDEO_ASSISTANT_CONSTANTS.ERRORS.RATE_LIMIT).toBe('Rate limit exceeded. Please try again later.');
    expect(VIDEO_ASSISTANT_CONSTANTS.CONVERSATION_STATES.INITIAL).toBe('initial');
    expect(VIDEO_ASSISTANT_CONSTANTS.SUCCESS.VIDEO_GENERATED).toBe('Video generated successfully');
  });
});