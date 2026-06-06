import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// We test the auth validation schemas directly
// This does NOT require a running server

describe('Auth Validation - Password Strength', () => {
  let UserValidationSchema;

  // Dynamically import to avoid module resolution issues
  it('should load the validation schema', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    UserValidationSchema = module.AuthValidation.UserValidationSchema;
    expect(UserValidationSchema).toBeDefined();
  });

  it('should reject passwords shorter than 8 characters', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'Ab1!xyz', // 7 chars
      confirmPassword: 'Ab1!xyz',
    });

    expect(result.success).toBe(false);
  });

  it('should reject passwords without uppercase', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'abcdefg1!', // no uppercase
      confirmPassword: 'abcdefg1!',
    });

    expect(result.success).toBe(false);
  });

  it('should reject passwords without lowercase', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'ABCDEFG1!', // no lowercase
      confirmPassword: 'ABCDEFG1!',
    });

    expect(result.success).toBe(false);
  });

  it('should reject passwords without digits', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'Abcdefgh!', // no digit
      confirmPassword: 'Abcdefgh!',
    });

    expect(result.success).toBe(false);
  });

  it('should reject passwords without special characters', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'Abcdefg1', // no special char
      confirmPassword: 'Abcdefg1',
    });

    expect(result.success).toBe(false);
  });

  it('should accept a strong password meeting all requirements', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const result = schema.safeParse({
      email: 'test@example.com',
      password: 'StrongP@ss1', // uppercase, lowercase, digit, special
      confirmPassword: 'StrongP@ss1',
    });

    expect(result.success).toBe(true);
  });

  it('should reject passwords longer than 128 characters', async () => {
    const module = await import('../../src/app/modules/auth/auth.validation.js');
    const schema = module.AuthValidation.UserValidationSchema.shape.body;

    const longPassword = 'Aa1!' + 'x'.repeat(125); // 129 chars
    const result = schema.safeParse({
      email: 'test@example.com',
      password: longPassword,
      confirmPassword: longPassword,
    });

    expect(result.success).toBe(false);
  });
});
