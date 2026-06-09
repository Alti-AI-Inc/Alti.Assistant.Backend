import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Token from './token.model';

describe('Token Model', () => {
  it('should be defined and have the correct model name', () => {
    expect(Token).toBeDefined();
    expect(Token.modelName).toBe('Token');
  });

  it('should have userId field with correct properties', () => {
    const userIdPath = Token.schema.paths.userId;
    expect(userIdPath).toBeDefined();
    expect(userIdPath.instance).toBe('ObjectID');
    expect(userIdPath.isRequired).toBe(true);
    expect(userIdPath.options.ref).toBe('User');
  });

  it('should have token field with correct properties', () => {
    const tokenPath = Token.schema.paths.token;
    expect(tokenPath).toBeDefined();
    expect(tokenPath.instance).toBe('String');
    expect(tokenPath.isRequired).toBe(true);
  });

  it('should have expiresAt field with correct properties', () => {
    const expiresAtPath = Token.schema.paths.expiresAt;
    expect(expiresAtPath).toBeDefined();
    expect(expiresAtPath.instance).toBe('Date');
    expect(expiresAtPath.isRequired).toBe(true);
  });

  it('should have type field with correct properties and enum values', () => {
    const typePath = Token.schema.paths.type;
    expect(typePath).toBeDefined();
    expect(typePath.instance).toBe('String');
    expect(typePath.isRequired).toBe(true);
    expect(typePath.enumValues).toEqual(['emailVerification', 'passwordReset', 'deleteAccount']);
  });

  it('should have timestamps enabled', () => {
    expect(Token.schema.options.timestamps).toBe(true);
    expect(Token.schema.paths.createdAt).toBeDefined();
    expect(Token.schema.paths.updatedAt).toBeDefined();
  });

  it('should create a new token document instance successfully', () => {
    const tokenData = {
      userId: new mongoose.Types.ObjectId(),
      token: 'some-jwt-token-string',
      expiresAt: new Date(),
      type: 'emailVerification',
    };
    const tokenDoc = new Token(tokenData);
    expect(tokenDoc).toBeDefined();
    expect(tokenDoc.userId).toEqual(tokenData.userId);
    expect(tokenDoc.token).toBe(tokenData.token);
    expect(tokenDoc.expiresAt).toEqual(tokenData.expiresAt);
    expect(tokenDoc.type).toBe(tokenData.type);
    // createdAt and updatedAt are typically set by Mongoose upon saving to the database
    expect(tokenDoc.createdAt).toBeUndefined();
    expect(tokenDoc.updatedAt).toBeUndefined();
  });
});