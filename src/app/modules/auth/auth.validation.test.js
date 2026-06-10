import { describe, it, expect } from 'vitest';
import { AuthValidation } from './auth.validation';

describe('AuthValidation', () => {
  describe('UserValidationSchema', () => {
    const validUserData = {
      body: {
        email: 'test@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'tenant',
      },
    };

    it('should validate a user with all required and valid fields', () => {
      const result = AuthValidation.UserValidationSchema.safeParse(validUserData);
      expect(result.success).toBe(true);
      expect(result.data.body.role).toBe('tenant');
    });

    it('should set role to "unauthorized" by default if not provided', () => {
      const dataWithoutRole = {
        body: {
          email: 'test@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(dataWithoutRole);
      expect(result.success).toBe(true);
      expect(result.data.body.role).toBe('unauthorized');
    });

    it('should validate with optional fields present', () => {
      const dataWithOptionals = {
        body: {
          ...validUserData.body,
          profile: 'some profile info',
          confirmationToken: 'someToken',
          confirmationTokenExpires: new Date(),
          tenantId: 'someTenantId',
          invitationToken: 'someInvitationToken',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
      expect(result.data.body.profile).toBe('some profile info');
      expect(result.data.body.confirmationToken).toBe('someToken');
      expect(result.data.body.confirmationTokenExpires).toBeInstanceOf(Date);
      expect(result.data.body.tenantId).toBe('someTenantId');
      expect(result.data.body.invitationToken).toBe('someInvitationToken');
    });

    it('should fail if email is invalid', () => {
      const invalidEmailData = {
        body: {
          ...validUserData.body,
          email: 'invalid-email',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(invalidEmailData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'email']);
      expect(result.error.issues[0].message).toBe('Invalid email');
    });

    it('should fail if password is too short', () => {
      const shortPasswordData = {
        body: {
          ...validUserData.body,
          password: 'P1!',
          confirmPassword: 'P1!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(shortPasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must be at least 8 characters');
    });

    it('should fail if password is too long', () => {
      const longPasswordData = {
        body: {
          ...validUserData.body,
          password: 'a'.repeat(129),
          confirmPassword: 'a'.repeat(129),
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(longPasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must be at most 128 characters');
    });

    it('should fail if password does not meet complexity requirements (no uppercase)', () => {
      const noUppercasePasswordData = {
        body: {
          ...validUserData.body,
          password: 'password123!',
          confirmPassword: 'password123!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(noUppercasePasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must include at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should fail if password does not meet complexity requirements (no lowercase)', () => {
      const noLowercasePasswordData = {
        body: {
          ...validUserData.body,
          password: 'PASSWORD123!',
          confirmPassword: 'PASSWORD123!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(noLowercasePasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must include at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should fail if password does not meet complexity requirements (no number)', () => {
      const noNumberPasswordData = {
        body: {
          ...validUserData.body,
          password: 'Password!!',
          confirmPassword: 'Password!!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(noNumberPasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must include at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should fail if password does not meet complexity requirements (no special character)', () => {
      const noSpecialCharPasswordData = {
        body: {
          ...validUserData.body,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(noSpecialCharPasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password must include at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('should fail if password and confirmPassword do not match', () => {
      const mismatchPasswordData = {
        body: {
          ...validUserData.body,
          confirmPassword: 'DifferentPassword123!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(mismatchPasswordData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'confirmPassword']);
      expect(result.error.issues[0].message).toBe('Passwords do not match');
    });

    it('should fail if role is not one of the allowed values', () => {
      const invalidRoleData = {
        body: {
          ...validUserData.body,
          role: 'invalidRole',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(invalidRoleData);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'role']);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if body is missing', () => {
      const result = AuthValidation.UserValidationSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body']);
    });

    it('should fail if email is missing', () => {
      const data = {
        body: {
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
      };
      const result = AuthValidation.UserValidationSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'email']);
    });
  });

  describe('loginZodSchema', () => {
    const validLoginData = {
      body: {
        email: 'login@example.com',
        password: 'LoginPassword123!',
      },
    };

    it('should validate valid login credentials', () => {
      const result = AuthValidation.loginZodSchema.safeParse(validLoginData);
      expect(result.success).toBe(true);
      expect(result.data.body.email).toBe('login@example.com');
      expect(result.data.body.password).toBe('LoginPassword123!');
    });

    it('should validate login credentials with optional tenantId and invitationToken', () => {
      const dataWithOptionals = {
        body: {
          ...validLoginData.body,
          tenantId: 'someTenantIdForLogin',
          invitationToken: 'someInvitationTokenForLogin',
        },
      };
      const result = AuthValidation.loginZodSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
      expect(result.data.body.tenantId).toBe('someTenantIdForLogin');
      expect(result.data.body.invitationToken).toBe('someInvitationTokenForLogin');
    });

    it('should fail if email is missing', () => {
      const dataWithoutEmail = {
        body: {
          password: 'LoginPassword123!',
        },
      };
      const result = AuthValidation.loginZodSchema.safeParse(dataWithoutEmail);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'email']);
      expect(result.error.issues[0].message).toBe('Email is required');
    });

    it('should fail if password is missing', () => {
      const dataWithoutPassword = {
        body: {
          email: 'login@example.com',
        },
      };
      const result = AuthValidation.loginZodSchema.safeParse(dataWithoutPassword);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'password']);
      expect(result.error.issues[0].message).toBe('Password is required');
    });

    it('should fail if body is missing', () => {
      const result = AuthValidation.loginZodSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body']);
    });
  });

  describe('refreshTokenZodSchema', () => {
    const validRefreshTokenData = {
      cookies: {
        refreshToken: 'someValidRefreshTokenString',
      },
    };

    it('should validate a request with a valid refresh token in cookies', () => {
      const result = AuthValidation.refreshTokenZodSchema.safeParse(validRefreshTokenData);
      expect(result.success).toBe(true);
      expect(result.data.cookies.refreshToken).toBe('someValidRefreshTokenString');
    });

    it('should fail if refreshToken is missing from cookies', () => {
      const dataWithoutRefreshToken = {
        cookies: {},
      };
      const result = AuthValidation.refreshTokenZodSchema.safeParse(dataWithoutRefreshToken);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['cookies', 'refreshToken']);
      expect(result.error.issues[0].message).toBe('Refresh Token is required');
    });

    it('should fail if cookies object is missing', () => {
      const result = AuthValidation.refreshTokenZodSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['cookies']);
    });
  });
});