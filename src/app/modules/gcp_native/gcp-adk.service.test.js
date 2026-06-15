import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcpAdkService } from './gcp-adk.service.js'; // Adjust path as necessary

const {
  mockLogger
} = vi.hoisted(() => {
  // Mock the logger dependency
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockLogger
  };
});

// Mock the module to inject the mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('GcpAdkService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('compileAdkManifest', () => {
    it('should compile a full ADK manifest correctly with all provided fields', () => {
      const pluginConfig = {
        name: 'my-test-plugin',
        version: '2.0.0',
        scope: 'custom-scope',
        permissions: ['write_file', 'read_network'],
        toolBinding: 'custom_tool_executor',
        activities: [{ name: 'activity1' }, { name: 'activity2' }],
      };

      const expectedManifestContent = {
        name: 'my-test-plugin',
        version: '2.0.0',
        scope: 'custom-scope',
        permissions: ['write_file', 'read_network'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/my-test-plugin',
          toolBinding: 'custom_tool_executor',
          activities: [{ name: 'activity1' }, { name: 'activity2' }],
        },
      };

      const result = GcpAdkService.compileAdkManifest(pluginConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP ADK: Compiling developer manifest package for "my-test-plugin"...'
      );
      expect(result).toMatch(/^<adk-manifest>\n/);
      expect(result).toMatch(/\n<\/adk-manifest>$/);
      expect(JSON.parse(result.replace(/<adk-manifest>([\s\S]*?)<\/adk-manifest>/, '$1'))).toEqual(
        expectedManifestContent
      );
    });

    it('should compile an ADK manifest with default values for missing fields', () => {
      const pluginConfig = {
        name: 'minimal-plugin',
      };

      const expectedManifestContent = {
        name: 'minimal-plugin',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/minimal-plugin',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };

      const result = GcpAdkService.compileAdkManifest(pluginConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP ADK: Compiling developer manifest package for "minimal-plugin"...'
      );
      expect(JSON.parse(result.replace(/<adk-manifest>([\s\S]*?)<\/adk-manifest>/, '$1'))).toEqual(
        expectedManifestContent
      );
    });

    it('should use "unnamed-plugin" if name is not provided', () => {
      const pluginConfig = {};

      const expectedManifestContent = {
        name: 'unnamed-plugin',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/unnamed-plugin',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };

      const result = GcpAdkService.compileAdkManifest(pluginConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP ADK: Compiling developer manifest package for "unnamed-plugin"...'
      );
      expect(JSON.parse(result.replace(/<adk-manifest>([\s\S]*?)<\/adk-manifest>/, '$1'))).toEqual(
        expectedManifestContent
      );
    });
  });

  describe('validateAdkManifest', () => {
    it('should return success for a valid ADK manifest', () => {
      const manifestContent = {
        name: 'valid-plugin',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/valid-plugin',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };
      const rawText = `<adk-manifest>\n${JSON.stringify(manifestContent, null, 2)}\n</adk-manifest>`;

      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.info).toHaveBeenCalledWith('GCP ADK: Extracting <adk-manifest> block...');
      expect(mockLogger.info).toHaveBeenCalledWith('GCP ADK: Checking schema validation constraints on manifest...');
      expect(mockLogger.info).toHaveBeenCalledWith('GCP ADK: Manifest compiled and validated cleanly.');
      expect(result).toEqual({
        success: true,
        containsManifest: true,
        errors: [],
        manifest: manifestContent,
      });
    });

    it('should return success for a valid ADK manifest wrapped in ```json', () => {
      const manifestContent = {
        name: 'valid-plugin-json-block',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/valid-plugin',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };
      const rawText = `<adk-manifest>\n\`\`\`json\n${JSON.stringify(manifestContent, null, 2)}\n\`\`\`\n</adk-manifest>`;

      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(result.success).toBe(true);
      expect(result.manifest).toEqual(manifestContent);
    });

    it('should return an error if rawText is empty', () => {
      const result = GcpAdkService.validateAdkManifest('');

      expect(mockLogger.error).toHaveBeenCalledWith('GCP ADK Parsing Exception:', expect.any(Error));
      expect(result).toEqual({
        success: false,
        containsManifest: true,
        errors: ['Raw manifest block is empty.'],
        manifest: null,
      });
    });

    it('should return no manifest found if <adk-manifest> tags are missing', () => {
      const rawText = 'Some random text without manifest tags.';
      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.info).toHaveBeenCalledWith('GCP ADK: Extracting <adk-manifest> block...');
      expect(result).toEqual({
        success: true,
        containsManifest: false,
        message: 'No ADK developer manifest found in target file block.',
        manifest: null,
      });
    });

    it('should return an error if JSON inside manifest tags is invalid', () => {
      const rawText = `<adk-manifest>\n{ "name": "invalid-json", "version": "1.0.0", "scope": "test", "permissions": ["read"], "entryPoints": { "routePrefix": "/api" }, }\n</adk-manifest>`; // Trailing comma makes it invalid JSON
      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.error).toHaveBeenCalledWith('GCP ADK Parsing Exception:', expect.any(Error));
      expect(result.success).toBe(false);
      expect(result.containsManifest).toBe(true);
      expect(result.errors[0]).toMatch(/Unexpected token } in JSON at position/);
      expect(result.manifest).toBeNull();
    });

    it('should return errors for missing mandatory fields', () => {
      const manifestContent = {
        permissions: ['read_file'],
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/missing-fields',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };
      const rawText = `<adk-manifest>\n${JSON.stringify(manifestContent, null, 2)}\n</adk-manifest>`;

      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCP ADK: Manifest validation failed with 3 errors.');
      expect(result).toEqual({
        success: false,
        containsManifest: true,
        errors: [
          'ADK Manifest missing mandatory field: "name"',
          'ADK Manifest missing mandatory field: "version"',
          'ADK Manifest missing mandatory field: "scope"',
        ],
        manifest: manifestContent,
      });
    });

    it('should return an error if permissions is not an array', () => {
      const manifestContent = {
        name: 'invalid-permissions',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: 'read_file', // Should be an array
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/invalid-permissions',
          toolBinding: 'default_tool_executor',
          activities: [],
        },
      };
      const rawText = `<adk-manifest>\n${JSON.stringify(manifestContent, null, 2)}\n</adk-manifest>`;

      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCP ADK: Manifest validation failed with 1 errors.');
      expect(result).toEqual({
        success: false,
        containsManifest: true,
        errors: ['ADK Manifest permissions must be a non-empty array of strings.'],
        manifest: manifestContent,
      });
    });

    it('should return an error if entryPoints is missing or not an object', () => {
      const manifestContent = {
        name: 'invalid-entrypoints',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        // entryPoints is missing
      };
      const rawText = `<adk-manifest>\n${JSON.stringify(manifestContent, null, 2)}\n</adk-manifest>`;

      const result = GcpAdkService.validateAdkManifest(rawText);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCP ADK: Manifest validation failed with 1 errors.');
      expect(result).toEqual({
        success: false,
        containsManifest: true,
        errors: ['ADK Manifest entryPoints must be a valid defined configuration object.'],
        manifest: manifestContent,
      });

      // Test with entryPoints not an object
      const manifestContentInvalidEntryPoints = {
        name: 'invalid-entrypoints-type',
        version: '1.0.0',
        scope: 'gcp-mcp-extensions',
        permissions: ['read_file'],
        entryPoints: 'not-an-object',
      };
      const rawTextInvalidEntryPoints = `<adk-manifest>\n${JSON.stringify(
        manifestContentInvalidEntryPoints,
        null,
        2
      )}\n</adk-manifest>`;

      const resultInvalidEntryPoints = GcpAdkService.validateAdkManifest(rawTextInvalidEntryPoints);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCP ADK: Manifest validation failed with 1 errors.');
      expect(resultInvalidEntryPoints).toEqual({
        success: false,
        containsManifest: true,
        errors: ['ADK Manifest entryPoints must be a valid defined configuration object.'],
        manifest: manifestContentInvalidEntryPoints,
      });
    });
  });

  describe('bootstrapAdkExtension', () => {
    it('should successfully bootstrap a valid ADK manifest', () => {
      const manifest = {
        name: 'bootstrapped-plugin',
        scope: 'gcp-mcp-extensions',
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/bootstrapped-plugin',
          activities: [{ name: 'activityA' }, { name: 'activityB' }],
        },
      };

      const result = GcpAdkService.bootstrapAdkExtension(manifest);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP ADK: Bootstrapping extension "bootstrapped-plugin" under scope "gcp-mcp-extensions"...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP ADK: Extension "bootstrapped-plugin" bootstrapped successfully and is now active.'
      );
      expect(result).toEqual(
        expect.objectContaining({
          bootstrapped: true,
          pluginName: 'bootstrapped-plugin',
          routePrefix: '/api/v1/gcp-native/ext/bootstrapped-plugin',
          registeredActivitiesCount: 2,
          timestamp: expect.any(String),
        })
      );
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp); // Ensure timestamp is valid ISO string
    });

    it('should handle manifest with no activities', () => {
      const manifest = {
        name: 'no-activities-plugin',
        scope: 'gcp-mcp-extensions',
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/no-activities-plugin',
          activities: [],
        },
      };

      const result = GcpAdkService.bootstrapAdkExtension(manifest);

      expect(result.registeredActivitiesCount).toBe(0);
    });

    it('should handle manifest with missing entryPoints.activities', () => {
      const manifest = {
        name: 'missing-activities-plugin',
        scope: 'gcp-mcp-extensions',
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/missing-activities-plugin',
        },
      };

      const result = GcpAdkService.bootstrapAdkExtension(manifest);

      expect(result.registeredActivitiesCount).toBe(0);
    });

    it('should throw an error if manifest is null or undefined', () => {
      expect(() => GcpAdkService.bootstrapAdkExtension(null)).toThrow(
        'Valid ADK manifest configuration is required to bootstrap extensions.'
      );
      expect(() => GcpAdkService.bootstrapAdkExtension(undefined)).toThrow(
        'Valid ADK manifest configuration is required to bootstrap extensions.'
      );
    });

    it('should throw an error if manifest is missing name', () => {
      const manifest = {
        scope: 'gcp-mcp-extensions',
        entryPoints: {
          routePrefix: '/api/v1/gcp-native/ext/missing-name',
          activities: [],
        },
      };
      expect(() => GcpAdkService.bootstrapAdkExtension(manifest)).toThrow(
        'Valid ADK manifest configuration is required to bootstrap extensions.'
      );
    });
  });
});