import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertComposioToolsToLangchainTools, getAndConvertComposioTools } from './composio.utils';

// Mock external dependencies
const mockGetComposioTools = vi.fn();
vi.mock('./composio.service', () => ({
  getComposioTools: mockGetComposioTools,
}));

// Mock LangChain Tool class
const mockToolInstances = [];
class MockTool {
  constructor({ name, description, func, schema }) {
    this.name = name;
    this.description = description;
    this.func = func;
    this.schema = schema;
    mockToolInstances.push(this); // Store instances for inspection
  }

  // Simulate the call method if it were used directly, though here we test the func property
  async call(input) {
    return this.func(input);
  }
}
vi.mock('@langchain/core/tools', () => ({
  Tool: MockTool,
}));

describe('composio.utils', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    mockGetComposioTools.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
    mockToolInstances.length = 0; // Clear stored mock tool instances
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('convertComposioToolsToLangchainTools', () => {
    const mockRawTools = [
      {
        name: 'tool1',
        description: 'Description for tool1',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'tool2',
        description: 'Description for tool2',
        input_schema: { type: 'object', properties: { id: { type: 'number' } } },
      },
    ];

    it('should convert valid raw tools to LangChain Tool instances', () => {
      const langchainTools = convertComposioToolsToLangchainTools(mockRawTools);

      expect(langchainTools).toHaveLength(2);
      expect(mockToolInstances).toHaveLength(2);

      expect(langchainTools[0]).toBeInstanceOf(MockTool);
      expect(langchainTools[0].name).toBe('tool1');
      expect(langchainTools[0].description).toBe('Description for tool1');
      expect(langchainTools[0].schema).toEqual(mockRawTools[0].input_schema);
      expect(typeof langchainTools[0].func).toBe('function');

      expect(langchainTools[1]).toBeInstanceOf(MockTool);
      expect(langchainTools[1].name).toBe('tool2');
      expect(langchainTools[1].description).toBe('Description for tool2');
      expect(langchainTools[1].schema).toEqual(mockRawTools[1].input_schema);
      expect(typeof langchainTools[1].func).toBe('function');
    });

    it('should return an empty array if rawTools is empty', () => {
      const langchainTools = convertComposioToolsToLangchainTools([]);
      expect(langchainTools).toEqual([]);
      expect(mockToolInstances).toHaveLength(0);
    });

    it('should throw an error if input is not an array', () => {
      expect(() => convertComposioToolsToLangchainTools(null)).toThrow('Input must be an array of raw tools.');
      expect(() => convertComposioToolsToLangchainTools('string')).toThrow('Input must be an array of raw tools.');
      expect(() => convertComposioToolsToLangchainTools({})).toThrow('Input must be an array of raw tools.');
      expect(mockToolInstances).toHaveLength(0);
    });

    it('should skip invalid raw tools and log a warning', () => {
      const invalidRawTools = [
        mockRawTools[0],
        { name: 'invalid1', description: 'missing schema' }, // Missing input_schema
        { description: 'invalid2', input_schema: {} }, // Missing name
        { name: 'invalid3', input_schema: {} }, // Missing description
        null, // Null entry
        undefined, // Undefined entry
        'not an object', // Not an object
        mockRawTools[1],
      ];

      const langchainTools = convertComposioToolsToLangchainTools(invalidRawTools);

      expect(langchainTools).toHaveLength(2);
      expect(mockToolInstances).toHaveLength(2);
      expect(langchainTools[0].name).toBe('tool1');
      expect(langchainTools[1].name).toBe('tool2');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(6); // For each invalid entry
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', { name: 'invalid1', description: 'missing schema' });
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', { description: 'invalid2', input_schema: {} });
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', { name: 'invalid3', input_schema: {} });
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', null);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', undefined);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid raw tool format encountered, skipping:', 'not an object');
    });

    it('should correctly execute the func property of a converted tool', async () => {
      const langchainTools = convertComposioToolsToLangchainTools([mockRawTools[0]]);
      const tool = langchainTools[0];

      expect(typeof tool.func).toBe('function');

      const input = 'test input';
      const result = await tool.func(input);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Executing Composio tool: ${tool.name} with input: ${input}`);
      expect(result).toBe(`Mock response for ${tool.name} with input ${input}`);
    });
  });

  describe('getAndConvertComposioTools', () => {
    const mockRawTools = [
      { name: 'serviceTool1', description: 'Desc1', input_schema: { type: 'string' } },
      { name: 'serviceTool2', description: 'Desc2', input_schema: { type: 'number' } },
    ];

    it('should fetch raw tools and convert them successfully', async () => {
      mockGetComposioTools.mockResolvedValue(mockRawTools);

      const langchainTools = await getAndConvertComposioTools();

      expect(mockGetComposioTools).toHaveBeenCalledTimes(1);
      expect(langchainTools).toHaveLength(2);
      expect(mockToolInstances).toHaveLength(2);
      expect(langchainTools[0].name).toBe('serviceTool1');
      expect(langchainTools[1].name).toBe('serviceTool2');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return an empty array if getComposioTools returns an empty array', async () => {
      mockGetComposioTools.mockResolvedValue([]);

      const langchainTools = await getAndConvertComposioTools();

      expect(mockGetComposioTools).toHaveBeenCalledTimes(1);
      expect(langchainTools).toEqual([]);
      expect(mockToolInstances).toHaveLength(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should re-throw error if getComposioTools fails', async () => {
      const serviceError = new Error('Service unavailable');
      mockGetComposioTools.mockRejectedValue(serviceError);

      await expect(getAndConvertComposioTools()).rejects.toThrow(serviceError);
      expect(mockGetComposioTools).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching or converting Composio tools:', serviceError);
      expect(mockToolInstances).toHaveLength(0);
    });

    it('should handle cases where getComposioTools returns invalid data (e.g., not an array)', async () => {
      // This scenario would cause convertComposioToolsToLangchainTools to throw
      mockGetComposioTools.mockResolvedValue('not an array');

      const expectedError = new Error('Input must be an array of raw tools.');
      await expect(getAndConvertComposioTools()).rejects.toThrow(expectedError);
      expect(mockGetComposioTools).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching or converting Composio tools:', expectedError);
      expect(mockToolInstances).toHaveLength(0);
    });

    it('should filter out invalid tools returned by the service', async () => {
      const mixedRawTools = [
        { name: 'validTool', description: 'Valid desc', input_schema: { type: 'string' } },
        { name: 'invalidTool', description: 'Missing schema' }, // Invalid
        { description: 'anotherInvalid' }, // Invalid
      ];
      mockGetComposioTools.mockResolvedValue(mixedRawTools);

      const langchainTools = await getAndConvertComposioTools();

      expect(mockGetComposioTools).toHaveBeenCalledTimes(1);
      expect(langchainTools).toHaveLength(1);
      expect(langchainTools[0].name).toBe('validTool');
      expect(mockToolInstances).toHaveLength(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2); // For the two invalid tools
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});