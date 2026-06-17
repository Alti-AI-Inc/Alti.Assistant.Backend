import { expect, describe, it } from 'vitest';
import GoogleRepository from './gcp-repository.model';
import mongoose from 'mongoose';

describe('GoogleRepository Model', () => {
  it('should be a Mongoose model', () => {
    expect(GoogleRepository).toBeDefined();
    expect(GoogleRepository.prototype).toBeInstanceOf(mongoose.Model);
    expect(GoogleRepository.modelName).toBe('GoogleRepository');
  });

  it('should have the correct schema definition for "name"', () => {
    const name = GoogleRepository.schema.obj.name;
    expect(name).toEqual({ type: String, required: true, index: true });
  });

  it('should have the correct schema definition for "org"', () => {
    const org = GoogleRepository.schema.obj.org;
    expect(org).toEqual({ type: String, required: true, enum: ['GoogleCloudPlatform', 'google'], index: true });
  });

  it('should have the correct schema definition for "description"', () => {
    const description = GoogleRepository.schema.obj.description;
    expect(description).toEqual({ type: String, default: '' });
  });

  it('should have the correct schema definition for "license"', () => {
    const license = GoogleRepository.schema.obj.license;
    expect(license).toEqual({ type: String, required: true, enum: ['MIT', 'Apache 2.0'], index: true });
  });

  it('should have the correct schema definition for "html_url"', () => {
    const html_url = GoogleRepository.schema.obj.html_url;
    expect(html_url).toEqual({ type: String, required: true });
  });

  it('should have the correct schema definition for "clone_url"', () => {
    const clone_url = GoogleRepository.schema.obj.clone_url;
    expect(clone_url).toEqual({ type: String, required: true });
  });

  it('should have the correct schema definition for "stars"', () => {
    const stars = GoogleRepository.schema.obj.stars;
    expect(stars).toEqual({ type: Number, default: 0 });
  });

  it('should have the correct schema definition for "forks"', () => {
    const forks = GoogleRepository.schema.obj.forks;
    expect(forks).toEqual({ type: Number, default: 0 });
  });

  it('should have the correct schema definition for "language"', () => {
    const language = GoogleRepository.schema.obj.language;
    expect(language).toEqual({ type: String, default: 'Unknown', index: true });
  });

  it('should have the correct schema definition for "updatedAt"', () => {
    const updatedAt = GoogleRepository.schema.paths.updatedAt;
    expect(updatedAt).toBeDefined();
    expect(updatedAt.instance).toBe('Date');
  });

  it('should have timestamps enabled', () => {
    expect(GoogleRepository.schema.options.timestamps).toBe(true);
  });

  it('should have the correct indexes defined', () => {
    const indexes = GoogleRepository.schema.indexes();

    // Check for the compound text index
    const textIndex = indexes.find(
      ([fields, options]) =>
        fields.name === 'text' &&
        fields.description === 'text' &&
        options.weights &&
        options.weights.name === 10 &&
        options.weights.description === 2 &&
        options.name === 'TextIndex'
    );
    expect(textIndex).toBeDefined();

    // Check for individual field indexes (Mongoose adds `background: true` by default for `index: true`)
    expect(indexes).toContainEqual([{ name: 1 }, { background: true }]);
    expect(indexes).toContainEqual([{ org: 1 }, { background: true }]);
    expect(indexes).toContainEqual([{ license: 1 }, { background: true }]);
    expect(indexes).toContainEqual([{ language: 1 }, { background: true }]);
  });
});