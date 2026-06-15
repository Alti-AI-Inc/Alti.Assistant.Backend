import { describe, it, expect } from 'vitest';
import {
  ARTICLE_WRITER_CONFIG,
  USER_ROLES,
  FEATURE_LIMITS_CONFIG,
  ARTICLE_TYPES,
  WRITING_TONES,
  ARTICLE_LENGTHS,
  ARTICLE_LENGTH_DETAILS,
  CONVERSATION_CATEGORY,
  STORAGE_CONFIG,
  SYSTEM_PROMPTS,
  ARTICLE_GENERATION_PROMPT_TEMPLATE,
  RESPONSE_MESSAGES,
  DEFAULT_PARAMS,
} from './article_writer.constant.js';

describe('Article Writer Constants Integrity', () => {

  describe('ARTICLE_WRITER_CONFIG', () => {
    it('should have a valid structure and types', () => {
      expect(ARTICLE_WRITER_CONFIG).toBeTypeOf('object');
      expect(ARTICLE_WRITER_CONFIG.MODEL).toBeTypeOf('string');
      expect(ARTICLE_WRITER_CONFIG.TEMPERATURE).toBeTypeOf('number');
      expect(ARTICLE_WRITER_CONFIG.DEFAULT_MAX_OUTPUT_TOKENS).toBeTypeOf('number');
      expect(ARTICLE_WRITER_CONFIG.DEFAULT_MAX_FILE_SIZE).toBeTypeOf('number');
      expect(ARTICLE_WRITER_CONFIG.DEFAULT_MAX_CONCURRENT_JOBS).toBeTypeOf('number');
      expect(Array.isArray(ARTICLE_WRITER_CONFIG.SUPPORTED_MIME_TYPES)).toBe(true);
      expect(Array.isArray(ARTICLE_WRITER_CONFIG.SUPPORTED_FILE_EXTENSIONS)).toBe(true);
    });

    it('should contain non-empty arrays for supported file types', () => {
      expect(ARTICLE_WRITER_CONFIG.SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0);
      expect(ARTICLE_WRITER_CONFIG.SUPPORTED_FILE_EXTENSIONS.length).toBeGreaterThan(0);
    });
  });

  describe('FEATURE_LIMITS_CONFIG and USER_ROLES', () => {
    const limitShape = {
      maxFileSize: expect.any(Number),
      maxOutputTokens: expect.any(Number),
      maxConcurrentJobs: expect.any(Number),
    };

    it('should have a valid top-level structure', () => {
      expect(FEATURE_LIMITS_CONFIG).toHaveProperty('platform_defaults');
      expect(FEATURE_LIMITS_CONFIG).toHaveProperty('roles');
      expect(FEATURE_LIMITS_CONFIG).toHaveProperty('tiers');
    });

    it('should have a valid platform_defaults structure', () => {
      expect(FEATURE_LIMITS_CONFIG.platform_defaults).toEqual(expect.objectContaining({
        ...limitShape,
        maxUsersPerWorkspace: expect.any(Number),
        maxTotalMonthlyTokens: expect.any(Number),
      }));
    });

    it('should define limits for every role in USER_ROLES', () => {
      const definedRoles = Object.values(USER_ROLES);
      const configuredRoles = Object.keys(FEATURE_LIMITS_CONFIG.roles);
      expect(configuredRoles).toEqual(expect.arrayContaining(definedRoles));
      expect(definedRoles.length).toBe(configuredRoles.length);
    });

    it('should have a valid structure for each role limit', () => {
      Object.values(FEATURE_LIMITS_CONFIG.roles).forEach(roleLimits => {
        expect(roleLimits).toEqual(expect.objectContaining(limitShape));
      });
    });
    
    it('should have a valid structure for each tier limit', () => {
      Object.values(FEATURE_LIMITS_CONFIG.tiers).forEach(tierLimits => {
        expect(tierLimits).toEqual(expect.objectContaining(limitShape));
      });
    });

    describe('Role-based Limit Hierarchy (Context Boundaries)', () => {
      const roles = FEATURE_LIMITS_CONFIG.roles;
      const superAdmin = roles[USER_ROLES.SUPER_ADMIN];
      const admin = roles[USER_ROLES.ADMIN];
      const manager = roles[USER_ROLES.MANAGER];
      const user = roles[USER_ROLES.USER];

      it('should have maxFileSize in descending order of role privilege', () => {
        expect(superAdmin.maxFileSize).toBeGreaterThanOrEqual(admin.maxFileSize);
        expect(admin.maxFileSize).toBeGreaterThanOrEqual(manager.maxFileSize);
        expect(manager.maxFileSize).toBeGreaterThanOrEqual(user.maxFileSize);
      });

      it('should have maxOutputTokens in descending order of role privilege', () => {
        expect(superAdmin.maxOutputTokens).toBeGreaterThanOrEqual(admin.maxOutputTokens);
        expect(admin.maxOutputTokens).toBeGreaterThanOrEqual(manager.maxOutputTokens);
        expect(manager.maxOutputTokens).toBeGreaterThanOrEqual(user.maxOutputTokens);
      });

      it('should have maxConcurrentJobs in descending order of role privilege', () => {
        expect(superAdmin.maxConcurrentJobs).toBeGreaterThanOrEqual(admin.maxConcurrentJobs);
        expect(admin.maxConcurrentJobs).toBeGreaterThanOrEqual(manager.maxConcurrentJobs);
        expect(manager.maxConcurrentJobs).toBeGreaterThanOrEqual(user.maxConcurrentJobs);
      });
    });
  });

  describe('ARTICLE_TYPES and SYSTEM_PROMPTS', () => {
    it('should have a system prompt for every article type', () => {
      const definedTypes = Object.values(ARTICLE_TYPES);
      
      definedTypes.forEach(type => {
        expect(SYSTEM_PROMPTS).toHaveProperty(type);
        expect(SYSTEM_PROMPTS[type]).toBeTypeOf('string');
        expect(SYSTEM_PROMPTS[type].length).toBeGreaterThan(0);
      });
    });

    it('should not have prompts for non-existent article types', () => {
        const definedTypes = Object.values(ARTICLE_TYPES);
        const promptedTypes = Object.keys(SYSTEM_PROMPTS).filter(key => key !== 'CONVERSATIONAL');
        expect(promptedTypes).toEqual(expect.arrayContaining(definedTypes));
        expect(promptedTypes.length).toBe(definedTypes.length);
    });

    it('should have a non-empty CONVERSATIONAL prompt', () => {
      expect(SYSTEM_PROMPTS.CONVERSATIONAL).toBeTypeOf('string');
      expect(SYSTEM_PROMPTS.CONVERSATIONAL.length).toBeGreaterThan(0);
    });
  });

  describe('ARTICLE_LENGTHS and ARTICLE_LENGTH_DETAILS', () => {
    it('should have details for every article length', () => {
      const definedLengths = Object.values(ARTICLE_LENGTHS);
      const detailedLengths = Object.keys(ARTICLE_LENGTH_DETAILS);
      
      expect(detailedLengths).toEqual(expect.arrayContaining(definedLengths));
      expect(definedLengths.length).toBe(detailedLengths.length);

      Object.values(ARTICLE_LENGTH_DETAILS).forEach(detail => {
        expect(detail).toBeTypeOf('string');
        expect(detail.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ARTICLE_GENERATION_PROMPT_TEMPLATE', () => {
    it('should contain all required placeholders', () => {
      const template = ARTICLE_GENERATION_PROMPT_TEMPLATE;
      expect(template).toContain('{{articleType}}');
      expect(template).toContain('{{articleTypeInstructions}}');
      expect(template).toContain('{{tone}}');
      expect(template).toContain('{{length}}');
      expect(template).toContain('{{lengthDetails}}');
      expect(template).toContain('{{sourceMaterial}}');
    });
  });

  describe('DEFAULT_PARAMS', () => {
    it('should use valid default values from their respective enums', () => {
      expect(Object.values(ARTICLE_TYPES)).toContain(DEFAULT_PARAMS.articleType);
      expect(Object.values(WRITING_TONES)).toContain(DEFAULT_PARAMS.tone);
      expect(Object.values(ARTICLE_LENGTHS)).toContain(DEFAULT_PARAMS.length);
    });
  });

  describe('Miscellaneous Constants', () => {
    it('should define a non-empty CONVERSATION_CATEGORY', () => {
      expect(CONVERSATION_CATEGORY).toBeTypeOf('string');
      expect(CONVERSATION_CATEGORY.length).toBeGreaterThan(0);
    });

    it('should define a valid STORAGE_CONFIG', () => {
      expect(STORAGE_CONFIG.BASE_UPLOAD_PATH).toBeTypeOf('string');
      expect(STORAGE_CONFIG.BASE_UPLOAD_PATH.length).toBeGreaterThan(0);
      // As per comment, path should not have trailing slash to allow for clean joining
      expect(STORAGE_CONFIG.BASE_UPLOAD_PATH.endsWith('/')).toBe(false);
    });

    it('should define a non-empty set of RESPONSE_MESSAGES', () => {
      expect(Object.keys(RESPONSE_MESSAGES).length).toBeGreaterThan(0);
      Object.values(RESPONSE_MESSAGES).forEach(message => {
        expect(message).toBeTypeOf('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });
});