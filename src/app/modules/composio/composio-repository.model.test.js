import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import ComposioRepository from './composio-repository.model.js';

describe('ComposioRepository Model', () => {
  const getValidRepoData = () => ({
    name: 'Test Repo',
    description: 'A test repository.',
    license: 'MIT',
    html_url: 'https://github.com/test/repo',
    clone_url: 'https://github.com/test/repo.git',
    stars: 100,
    forks: 50,
    language: 'JavaScript',
    isPublic: false,
    workspaceId: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId()
  });

  it('should correctly create and validate a private repository with all fields', async () => {
    const data = getValidRepoData();
    const repo = new ComposioRepository(data);
    const error = repo.validateSync();
    expect(error).toBeUndefined();
  });

  it('should correctly create and validate a public repository without a workspaceId', async () => {
    const data = { ...getValidRepoData(), isPublic: true, workspaceId: null };
    const repo = new ComposioRepository(data);
    const error = repo.validateSync();
    expect(error).toBeUndefined();
  });

  describe('Field Validations', () => {
    it.each([
      ['name'],
      ['license'],
      ['html_url'],
      ['clone_url'],
    ])('should fail validation if required field "%s" is missing', (field) => {
      const data = getValidRepoData();
      delete data[field];
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors[field]).toBeDefined();
    });

    it('should fail validation for an invalid license value', () => {
      const data = { ...getValidRepoData(), license: 'InvalidLicense' };
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors.license).toBeDefined();
      expect(error.errors.license.kind).toBe('enum');
    });

    it('should fail validation for an invalid html_url format', () => {
      const data = { ...getValidRepoData(), html_url: 'not-a-valid-url' };
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors.html_url).toBeDefined();
      expect(error.errors.html_url.message).toContain('Please provide a valid URL for html_url');
    });

    it('should fail validation for an invalid clone_url format', () => {
      const data = { ...getValidRepoData(), clone_url: 'ftp://invalid.com/repo.git' };
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors.clone_url).toBeDefined();
      expect(error.errors.clone_url.message).toContain('Please provide a valid URL for clone_url');
    });

    it.each([
        ['https://github.com/user/repo.git'],
        ['http://gitlab.com/user/repo.git'],
        ['git@github.com:user/repo.git'],
        ['ssh://git@github.com/user/repo.git'],
    ])('should pass validation for a valid clone_url: %s', (url) => {
        const data = { ...getValidRepoData(), clone_url: url };
        const repo = new ComposioRepository(data);
        const error = repo.validateSync();
        expect(error).toBeUndefined();
    });

    it.each([
      ['stars', -1],
      ['forks', -10],
      ['executionCount', -1],
    ])('should fail validation if "%s" is a negative number', (field, value) => {
      const data = { ...getValidRepoData(), [field]: value };
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors[field]).toBeDefined();
      expect(error.errors[field].kind).toBe('min');
    });
  });

  describe('Context and Tenancy Logic', () => {
    it('should fail validation if repository is private (isPublic: false) and workspaceId is missing', () => {
      const data = getValidRepoData();
      delete data.workspaceId;
      data.isPublic = false;
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error.errors.workspaceId).toBeDefined();
      expect(error.errors.workspaceId.kind).toBe('required');
    });

    it('should pass validation if repository is private (isPublic: false) and workspaceId is provided', () => {
      const data = { ...getValidRepoData(), isPublic: false, workspaceId: new mongoose.Types.ObjectId() };
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error).toBeUndefined();
    });

    it('should pass validation if repository is public (isPublic: true) and workspaceId is null or undefined', () => {
      const data = getValidRepoData();
      delete data.workspaceId;
      data.isPublic = true;
      const repo = new ComposioRepository(data);
      const error = repo.validateSync();
      expect(error).toBeUndefined();
    });
  });

  describe('Data Sanitization and Defaults', () => {
    it('should apply default values for optional fields', () => {
      const minimalData = {
        name: 'Minimal Repo',
        license: 'GPL-3.0',
        html_url: 'https://example.com',
        clone_url: 'https://example.com/clone.git',
        isPublic: true, // Public so workspaceId is not required
      };
      const repo = new ComposioRepository(minimalData);
      const error = repo.validateSync();
      
      expect(error).toBeUndefined();
      expect(repo.description).toBe('');
      expect(repo.stars).toBe(0);
      expect(repo.forks).toBe(0);
      expect(repo.language).toBe('Unknown');
      expect(repo.executionCount).toBe(0);
      expect(repo.isPublic).toBe(true); // Explicitly set, but good to check
      expect(repo.workspaceId).toBe(null);
    });

    it('should have a default isPublic value of false', () => {
        const data = getValidRepoData();
        delete data.isPublic; // Remove it to test default
        const repo = new ComposioRepository(data);
        expect(repo.isPublic).toBe(false);
    });

    it('should trim whitespace from name, description, and language', () => {
      const data = {
        ...getValidRepoData(),
        name: '  Trimmed Name  ',
        description: '  Trimmed Description.  ',
        language: '  Python  ',
      };
      const repo = new ComposioRepository(data);
      expect(repo.name).toBe('Trimmed Name');
      expect(repo.description).toBe('Trimmed Description.');
      expect(repo.language).toBe('Python');
    });

    it('should sanitize HTML from name and description fields to prevent XSS', () => {
      const xssPayload = '<script>alert("hacked")</script>';
      const data = {
        ...getValidRepoData(),
        name: `Repo with ${xssPayload}`,
        description: `Description with <b>bold</b> and ${xssPayload}`,
      };
      const repo = new ComposioRepository(data);
      expect(repo.name).toBe('Repo with alert("hacked")');
      expect(repo.description).toBe('Description with bold and alert("hacked")');
    });
  });

  describe('Timestamps', () => {
    it('should automatically add createdAt and updatedAt timestamps', () => {
      const repo = new ComposioRepository(getValidRepoData());
      // Note: Mongoose adds timestamps upon saving, not instantiation.
      // However, the schema definition ensures they will be there.
      // For a unit test, we can check if the paths exist in the schema.
      expect(ComposioRepository.schema.paths.createdAt).toBeDefined();
      expect(ComposioRepository.schema.paths.updatedAt).toBeDefined();
      
      // A more integration-style check would involve saving and retrieving,
      // but for a model unit test, schema path check is sufficient.
      // Let's also check the instance properties are undefined before save.
      expect(repo.createdAt).toBeUndefined();
      expect(repo.updatedAt).toBeUndefined();
    });
  });
});