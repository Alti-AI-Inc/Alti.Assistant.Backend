import { describe, it, expect } from 'vitest';
import taskValidationSchema from './notes.validation';
import { ZodError } from 'zod';

describe('taskValidationSchema', () => {
  // Test Case 1: Successfully parses an empty object (all fields are optional)
  it('should successfully parse an empty object', () => {
    const validData = {};
    const parsed = taskValidationSchema.parse(validData);
    expect(parsed).toEqual({});
  });

  // Test Case 2: Successfully parses an object with all valid fields
  it('should successfully parse an object with all valid fields', () => {
    const now = new Date();
    const validData = {
      title: 'Valid Task Title',
      description: 'This is a valid task description.',
      status: 'In Progress',
      createdAt: now,
      updatedAt: now,
      userId: 'user123',
    };
    const parsed = taskValidationSchema.parse(validData);
    expect(parsed).toEqual(validData);
  });

  // Test Case 3: Successfully parses an object with `updatedAt: null`
  it('should successfully parse an object when updatedAt is null', () => {
    const now = new Date();
    const validData = {
      title: 'Task with null update date',
      status: 'Pending',
      createdAt: now,
      updatedAt: null,
      userId: 'user456',
    };
    const parsed = taskValidationSchema.parse(validData);
    expect(parsed).toEqual(validData);
  });

  // Test Case 4: Successfully parses an object with only a subset of valid fields
  it('should successfully parse an object with a subset of valid fields', () => {
    const validData = {
      title: 'Only Title',
      status: 'Completed',
    };
    const parsed = taskValidationSchema.parse(validData);
    expect(parsed).toEqual(validData);
  });

  // Test Case 5: Fails when `title` is an empty string (violates min(1))
  it('should fail when title is an empty string', () => {
    const invalidData = { title: '' };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('String must contain at least 1 character(s)');
  });

  // Test Case 6: Fails when `title` is too long (violates max(255))
  it('should fail when title is too long', () => {
    const invalidData = { title: 'a'.repeat(256) };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('String must contain at most 255 character(s)');
  });

  // Test Case 7: Fails when `title` is not a string
  it('should fail when title is not a string', () => {
    const invalidData = { title: 123 };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected string, received number');
  });

  // Test Case 8: Fails when `description` is too long (violates max(1000))
  it('should fail when description is too long', () => {
    const invalidData = { description: 'a'.repeat(1001) };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('String must contain at most 1000 character(s)');
  });

  // Test Case 9: Fails when `description` is not a string
  it('should fail when description is not a string', () => {
    const invalidData = { description: true };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected string, received boolean');
  });

  // Test Case 10: Fails when `status` is an invalid enum value
  it('should fail when status is an invalid enum value', () => {
    const invalidData = { status: 'Invalid Status' };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow("Invalid enum value. Expected 'Pending' | 'In Progress' | 'Completed', received 'Invalid Status'");
  });

  // Test Case 11: Fails when `status` is not a string
  it('should fail when status is not a string', () => {
    const invalidData = { status: 123 };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected string, received number');
  });

  // Test Case 12: Fails when `createdAt` is not a Date object
  it('should fail when createdAt is not a Date object', () => {
    const invalidData = { createdAt: 'not a date' };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected date, received string');
  });

  // Test Case 13: Fails when `updatedAt` is not a Date object or null
  it('should fail when updatedAt is not a Date object or null', () => {
    const invalidData = { updatedAt: 'not a date or null' };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected date, received string');
  });

  // Test Case 14: Fails when `userId` is not a string
  it('should fail when userId is not a string', () => {
    const invalidData = { userId: 12345 };
    expect(() => taskValidationSchema.parse(invalidData)).toThrow(ZodError);
    expect(() => taskValidationSchema.parse(invalidData)).toThrow('Expected string, received number');
  });
});