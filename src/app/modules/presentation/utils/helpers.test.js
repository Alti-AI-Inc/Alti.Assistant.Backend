import { describe, it, expect } from 'vitest';
import {
  validateSlideIndices,
  formatPresentationResult,
  formatTaskStatus,
  sanitizeInput,
  extractPresentationId,
  extractTaskId,
  mergeParameters,
  checkParametersComplete,
} from './helpers.js';

describe('validateSlideIndices', () => {
  it('should return true for a valid array of slides', () => {
    const slides = [
      { index: 0, content: { title: 'Slide 1' } },
      { index: 2, content: { text: 'Content' } },
    ];
    expect(validateSlideIndices(slides, 3)).toBe(true);
  });

  it('should return true for an empty array of slides', () => {
    expect(validateSlideIndices([], 5)).toBe(true);
  });

  it('should return false if slides is not an array', () => {
    expect(validateSlideIndices(null, 5)).toBe(false);
    expect(validateSlideIndices(undefined, 5)).toBe(false);
    expect(validateSlideIndices({}, 5)).toBe(false);
    expect(validateSlideIndices('slides', 5)).toBe(false);
  });

  it('should return false if any slide index is out of bounds (>= maxSlides)', () => {
    const slides = [
      { index: 0, content: {} },
      { index: 5, content: {} },
    ];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if any slide index is negative', () => {
    const slides = [{ index: -1, content: {} }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if any slide index is not a number', () => {
    const slides = [{ index: '1', content: {} }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if any slide content is null', () => {
    const slides = [{ index: 1, content: null }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if any slide content is not an object', () => {
    const slides = [{ index: 1, content: 'invalid' }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if a slide object is missing the index property', () => {
    const slides = [{ content: {} }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });

  it('should return false if a slide object is missing the content property', () => {
    const slides = [{ index: 1 }];
    expect(validateSlideIndices(slides, 5)).toBe(false);
  });
});

describe('formatPresentationResult', () => {
  it('should format a synchronous result correctly', () => {
    const result = {
      presentation_id: 'pres-123',
      path: 'http://example.com/download',
      edit_path: 'http://example.com/edit',
      credits_consumed: 10,
    };
    const expected =
      `🎉 Your presentation is ready!\n\n` +
      `📊 Presentation ID: pres-123\n` +
      `📥 Download: http://example.com/download\n` +
      `✏️ Edit online: http://example.com/edit\n` +
      `💳 Credits consumed: 10`;
    expect(formatPresentationResult(result, false)).toBe(expected);
  });

  it('should format a synchronous result correctly when isAsync is omitted', () => {
    const result = {
      presentation_id: 'pres-123',
      path: 'http://example.com/download',
      edit_path: 'http://example.com/edit',
      credits_consumed: 10,
    };
    const expected =
      `🎉 Your presentation is ready!\n\n` +
      `📊 Presentation ID: pres-123\n` +
      `📥 Download: http://example.com/download\n` +
      `✏️ Edit online: http://example.com/edit\n` +
      `💳 Credits consumed: 10`;
    expect(formatPresentationResult(result)).toBe(expected);
  });

  it('should format an asynchronous result correctly', () => {
    const date = new Date();
    const result = {
      id: 'task-abc',
      status: 'pending',
      created_at: date.toISOString(),
    };
    const expected =
      `🚀 Presentation generation started!\n\n` +
      `Task ID: task-abc\n` +
      `Status: pending\n` +
      `Created: ${date.toLocaleString()}\n\n` +
      `You can check the status anytime by asking me!`;
    expect(formatPresentationResult(result, true)).toBe(expected);
  });
});

describe('formatTaskStatus', () => {
  it('should format a "completed" status with data correctly', () => {
    const result = {
      status: 'completed',
      data: {
        presentation_id: 'pres-456',
        path: 'http://example.com/dl',
        edit_path: 'http://example.com/ed',
        credits_consumed: 5,
      },
    };
    const expected =
      `📋 Task Status: COMPLETED\n\n` +
      `🎉 Your presentation is ready!\n\n` +
      `📊 Presentation ID: pres-456\n` +
      `📥 Download: http://example.com/dl\n` +
      `✏️ Edit online: http://example.com/ed\n` +
      `💳 Credits consumed: 5`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should handle a "completed" status without data', () => {
    const result = { status: 'completed' };
    const expected = `📋 Task Status: COMPLETED\n\n✅ Task completed, but presentation details are unavailable.`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should format a "failed" status correctly', () => {
    const result = { status: 'failed', message: 'An error occurred.' };
    const expected = `📋 Task Status: FAILED\n\n❌ Generation failed: An error occurred.`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should format a "processing" status correctly', () => {
    const result = { status: 'processing' };
    const expected = `📋 Task Status: PROCESSING\n\n⏳ Still generating... Please check back in a moment.`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should format a "pending" status correctly', () => {
    const result = { status: 'pending' };
    const expected = `📋 Task Status: PENDING\n\n📝 Task is queued and will start shortly.`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should handle an unknown status with a message', () => {
    const result = { status: 'archived', message: 'Task is old.' };
    const expected = `📋 Task Status: ARCHIVED\n\nTask is old.`;
    expect(formatTaskStatus(result)).toBe(expected);
  });

  it('should handle an unknown status without a message', () => {
    const result = { status: 'unknown' };
    const expected = `📋 Task Status: UNKNOWN\n\nStatus unknown`;
    expect(formatTaskStatus(result)).toBe(expected);
  });
});

describe('sanitizeInput', () => {
  it('should trim leading and trailing whitespace', () => {
    const input = '  hello world  ';
    expect(sanitizeInput(input)).toBe('hello world');
  });

  it('should truncate strings longer than 5000 characters', () => {
    const longString = 'a'.repeat(5001);
    expect(sanitizeInput(longString).length).toBe(5000);
  });

  it('should return an empty string for non-string inputs', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
    expect(sanitizeInput(123)).toBe('');
    expect(sanitizeInput({})).toBe('');
    expect(sanitizeInput([])).toBe('');
  });

  it('should handle an empty string correctly', () => {
    expect(sanitizeInput('')).toBe('');
  });
});

describe('extractPresentationId', () => {
  it('should extract a valid UUID from text', () => {
    const text = 'My presentation ID is 123e4567-e89b-12d3-a456-426614174000.';
    expect(extractPresentationId(text)).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should extract a valid uppercase UUID from text', () => {
    const text = 'ID: 123E4567-E89B-12D3-A456-426614174000';
    expect(extractPresentationId(text)).toBe('123E4567-E89B-12D3-A456-426614174000');
  });

  it('should return null if no UUID is found', () => {
    const text = 'There is no presentation ID here.';
    expect(extractPresentationId(text)).toBe(null);
  });

  it('should return null for a malformed UUID', () => {
    const text = 'Malformed ID: 123e4567-e89b-12d3-a456-42661417400';
    expect(extractPresentationId(text)).toBe(null);
  });

  it('should return the first UUID if multiple are present', () => {
    const text = 'First: 11111111-1111-1111-1111-111111111111, Second: 22222222-2222-2222-2222-222222222222';
    expect(extractPresentationId(text)).toBe('11111111-1111-1111-1111-111111111111');
  });
});

describe('extractTaskId', () => {
  it('should extract a valid task ID from text', () => {
    const text = 'Check status for task-abc123.';
    expect(extractTaskId(text)).toBe('task-abc123');
  });

  it('should extract a task ID with uppercase characters', () => {
    const text = 'The ID is task-XYZ987.';
    expect(extractTaskId(text)).toBe('task-XYZ987');
  });

  it('should return null if no task ID is found', () => {
    const text = 'There is no task here.';
    expect(extractTaskId(text)).toBe(null);
  });

  it('should return null for a malformed task ID', () => {
    const text = 'This is not a task_id.';
    expect(extractTaskId(text)).toBe(null);
  });

  it('should return null for "task-" without an identifier', () => {
    const text = 'The task- is incomplete.';
    expect(extractTaskId(text)).toBe(null);
  });

  it('should return the first task ID if multiple are present', () => {
    const text = 'Check task-111 and task-222.';
    expect(extractTaskId(text)).toBe('task-111');
  });
});

describe('mergeParameters', () => {
  it('should merge new parameters into existing ones', () => {
    const existing = { topic: 'AI' };
    const newParams = { slides: 10 };
    expect(mergeParameters(existing, newParams)).toEqual({ topic: 'AI', slides: 10 });
  });

  it('should override existing parameters with new ones', () => {
    const existing = { topic: 'AI', slides: 5 };
    const newParams = { slides: 10, theme: 'dark' };
    expect(mergeParameters(existing, newParams)).toEqual({ topic: 'AI', slides: 10, theme: 'dark' });
  });

  it('should not override with null or undefined values', () => {
    const existing = { topic: 'AI', slides: 5 };
    const newParams = { topic: null, slides: undefined, theme: 'light' };
    expect(mergeParameters(existing, newParams)).toEqual({ topic: 'AI', slides: 5, theme: 'light' });
  });

  it('should override with falsy values like 0, false, and ""', () => {
    const existing = { a: 1, b: true, c: 'hello' };
    const newParams = { a: 0, b: false, c: '' };
    expect(mergeParameters(existing, newParams)).toEqual({ a: 0, b: false, c: '' });
  });

  it('should not mutate the original objects', () => {
    const existing = { a: 1 };
    const newParams = { b: 2 };
    mergeParameters(existing, newParams);
    expect(existing).toEqual({ a: 1 });
    expect(newParams).toEqual({ b: 2 });
  });

  it('should return a new object', () => {
    const existing = { a: 1 };
    const newParams = { b: 2 };
    const result = mergeParameters(existing, newParams);
    expect(result).not.toBe(existing);
  });
});

describe('checkParametersComplete', () => {
  const requiredParams = {
    create: ['topic', 'slides'],
    edit: ['presentation_id', 'slide_edits'],
    greet: [],
  };

  it('should return complete: true when all required params are present', () => {
    const params = { topic: 'Vitest', slides: 10, extra: 'field' };
    expect(checkParametersComplete('create', params, requiredParams)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('should return complete: false with missing params listed', () => {
    const params = { topic: 'Vitest' };
    expect(checkParametersComplete('create', params, requiredParams)).toEqual({
      complete: false,
      missing: ['slides'],
    });
  });

  it('should return complete: false with all params missing', () => {
    const params = {};
    expect(checkParametersComplete('create', params, requiredParams)).toEqual({
      complete: false,
      missing: ['topic', 'slides'],
    });
  });

  it('should return complete: true for an intent with no required params', () => {
    const params = { message: 'hello' };
    expect(checkParametersComplete('greet', params, requiredParams)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('should return complete: true for an intent not in the required map', () => {
    const params = {};
    expect(checkParametersComplete('unknown_intent', params, requiredParams)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('should consider falsy values (0, "", false) as missing due to `!params[param]` check', () => {
    const params = { topic: 'AI', slides: 0 };
    expect(checkParametersComplete('create', params, requiredParams)).toEqual({
      complete: false,
      missing: ['slides'],
    });

    const params2 = { topic: '', slides: 5 };
    expect(checkParametersComplete('create', params2, requiredParams)).toEqual({
      complete: false,
      missing: ['topic'],
    });
  });

  it('should not consider null or undefined as present', () => {
    const params = { topic: 'AI', slides: null };
    expect(checkParametersComplete('create', params, requiredParams)).toEqual({
      complete: false,
      missing: ['slides'],
    });

    const params2 = { topic: 'AI', slides: undefined };
    expect(checkParametersComplete('create', params2, requiredParams)).toEqual({
      complete: false,
      missing: ['slides'],
    });
  });
});