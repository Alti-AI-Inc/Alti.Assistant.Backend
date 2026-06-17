import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import LangchainRepository from './langchain-repository.model.js';

describe('LangchainRepository Model', () => {
  it('should validate a valid repository object with default values', async () => {
    const validRepo = new LangchainRepository({
      name: 'langchainjs',
      license: 'MIT',
      html_url: 'https://github.com/langchain-ai/langchainjs',
      clone_url: 'https://github.com/langchain-ai/langchainjs.git',
    });

    const err = await validRepo.validate();
    expect(err).toBeUndefined();
    expect(validRepo.description).toBe('');
    expect(validRepo.stars).toBe(0);
    expect(validRepo.forks).toBe(0);
    expect(validRepo.language).toBe('Unknown');
  });

  it('should fail validation if required fields are missing', async () => {
    const invalidRepo = new LangchainRepository({});

    try {
      await invalidRepo.validate();
      throw new Error('Validation should have failed');
    } catch (error) {
      expect(error.errors.name).toBeDefined();
      expect(error.errors.html_url).toBeDefined();
      expect(error.errors.clone_url).toBeDefined();
    }
  });

  it('should fail validation if license is not in the allowed enum values', async () => {
    const invalidRepo = new LangchainRepository({
      name: 'langchainjs',
      license: 'Invalid-License',
      html_url: 'https://github.com/langchain-ai/langchainjs',
      clone_url: 'https://github.com/langchain-ai/langchainjs.git',
    });

    try {
      await invalidRepo.validate();
      throw new Error('Validation should have failed');
    } catch (error) {
      expect(error.errors.license).toBeDefined();
      expect(error.errors.license.message).toContain('is not a valid enum value');
    }
  });

  it('should accept Apache 2.0 as a valid license', async () => {
    const validRepo = new LangchainRepository({
      name: 'langchainjs',
      license: 'Apache 2.0',
      html_url: 'https://github.com/langchain-ai/langchainjs',
      clone_url: 'https://github.com/langchain-ai/langchainjs.git',
    });

    const err = await validRepo.validate();
    expect(err).toBeUndefined();
    expect(validRepo.license).toBe('Apache 2.0');
  });

  it('should have the correct schema indexes defined', () => {
    const indexes = LangchainRepository.schema.indexes();
    
    // Check for text index on name and description
    const textIndex = indexes.find(idx => idx[1] && idx[1].name === 'TextIndex');
    expect(textIndex).toBeDefined();
    expect(textIndex[0]).toEqual({ name: 'text', description: 'text' });
    expect(textIndex[1].weights).toEqual({ name: 10, description: 2 });

    // Check for single field indexes
    const nameIndex = indexes.find(idx => idx[0].name === 1);
    expect(nameIndex).toBeDefined();

    const licenseIndex = indexes.find(idx => idx[0].license === 1);
    expect(licenseIndex).toBeDefined();

    const languageIndex = indexes.find(idx => idx[0].language === 1);
    expect(languageIndex).toBeDefined();
  });
});