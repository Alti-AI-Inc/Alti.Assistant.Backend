import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import { streamingService } from './streaming.service'; // Assuming the service is exported as 'streamingService'

// Mock the 'fs' module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  createReadStream: vi.fn(),
  promises: {
    stat: vi.fn(),
  },
}));

// Mock the 'path' module if it were used for complex path manipulation,
// but for simple joins, it's often not strictly necessary to mock.
// We'll mock it to be safe and explicit.
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')), // Simple join for testing purposes
}));

describe('StreamingService', () => {
  let mockReadStream;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create a mock ReadStream that extends EventEmitter
    mockReadStream = Object.assign(new EventEmitter(), {
      pipe: vi.fn(dest => dest), // Mock pipe to return the destination stream
      // Add other methods if they are called on the stream object
    });

    // Default mock for fs.createReadStream
    vi.mocked(vi.requireMock('fs').createReadStream).mockReturnValue(mockReadStream);
  });

  describe('createFileStream', () => {
    const testFilePath = '/path/to/test/file.txt';

    it('should return a ReadStream when the file exists', () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(true);

      const stream = streamingService.createFileStream(testFilePath);

      expect(vi.requireMock('fs').existsSync).toHaveBeenCalledWith(testFilePath);
      expect(vi.requireMock('fs').createReadStream).toHaveBeenCalledWith(testFilePath);
      expect(stream).toBe(mockReadStream);
    });

    it('should throw an error if the file does not exist', () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(false);

      expect(() => streamingService.createFileStream(testFilePath)).toThrowError(
        `File not found: ${testFilePath}`
      );
      expect(vi.requireMock('fs').existsSync).toHaveBeenCalledWith(testFilePath);
      expect(vi.requireMock('fs').createReadStream).not.toHaveBeenCalled();
    });

    it('should correctly emit data from the mocked stream', async () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(true);

      const stream = streamingService.createFileStream(testFilePath);
      expect(stream).toBeInstanceOf(EventEmitter); // Ensure it's our mock stream

      const receivedData = [];
      stream.on('data', chunk => receivedData.push(chunk.toString()));
      const streamEndPromise = new Promise(resolve => stream.on('end', resolve));

      // Simulate data chunks and end event
      mockReadStream.emit('data', Buffer.from('Hello'));
      mockReadStream.emit('data', Buffer.from(' World'));
      mockReadStream.emit('end');

      await streamEndPromise;

      expect(receivedData.join('')).toBe('Hello World');
    });

    it('should handle stream errors', async () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(true);

      const stream = streamingService.createFileStream(testFilePath);
      const errorMessage = 'File read error';
      const errorPromise = new Promise((resolve, reject) => stream.on('error', reject));

      // Simulate an error event
      mockReadStream.emit('error', new Error(errorMessage));

      await expect(errorPromise).rejects.toThrow(errorMessage);
    });
  });

  describe('getStreamMetadata', () => {
    const dummyFilePath = 'temp/dummy-file.txt'; // Matches the assumed path.join behavior

    it('should return correct metadata for a known sourceId when file exists', async () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(true);
      vi.mocked(vi.requireMock('fs').promises.stat).mockResolvedValue({ size: 12345 });

      const metadata = await streamingService.getStreamMetadata('test-file-123');

      expect(vi.requireMock('fs').existsSync).toHaveBeenCalledWith(expect.stringContaining(dummyFilePath));
      expect(vi.requireMock('fs').promises.stat).toHaveBeenCalledWith(expect.stringContaining(dummyFilePath));
      expect(metadata).toEqual({
        name: 'dummy-file.txt',
        size: 12345,
        type: 'text/plain',
      });
    });

    it('should return fallback metadata for a known sourceId when file does not exist', async () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(false); // File does not exist
      vi.mocked(vi.requireMock('fs').promises.stat).mockResolvedValue({ size: 0 }); // Should not be called

      const metadata = await streamingService.getStreamMetadata('test-file-123');

      expect(vi.requireMock('fs').existsSync).toHaveBeenCalledWith(expect.stringContaining(dummyFilePath));
      expect(vi.requireMock('fs').promises.stat).not.toHaveBeenCalled();
      expect(metadata).toEqual({
        name: 'dummy-file.txt',
        size: 100, // Fallback size
        type: 'text/plain',
      });
    });

    it('should return null for a non-existent sourceId', async () => {
      const metadata = await streamingService.getStreamMetadata('non-existent');
      expect(metadata).toBeNull();
      expect(vi.requireMock('fs').existsSync).not.toHaveBeenCalled(); // Should not try to check file system
    });

    it('should throw an error for an invalid sourceId', async () => {
      await expect(streamingService.getStreamMetadata('invalid-id')).rejects.toThrowError(
        'Invalid source ID'
      );
      expect(vi.requireMock('fs').existsSync).not.toHaveBeenCalled();
    });

    it('should handle errors from fs.promises.stat', async () => {
      vi.mocked(vi.requireMock('fs').existsSync).mockReturnValue(true);
      const statError = new Error('Permission denied');
      vi.mocked(vi.requireMock('fs').promises.stat).mockRejectedValue(statError);

      await expect(streamingService.getStreamMetadata('test-file-123')).rejects.toThrowError(statError);
    });
  });

  describe('createDataStream', () => {
    it('should return a Readable stream', () => {
      const stream = streamingService.createDataStream('some data');
      expect(stream).toBeInstanceOf(Readable);
    });

    it('should emit the provided data', async () => {
      const testData = 'This is a test string for streaming.';
      const stream = streamingService.createDataStream(testData);

      let receivedData = '';
      const dataPromise = new Promise(resolve => {
        stream.on('data', chunk => {
          receivedData += chunk.toString();
        });
        stream.on('end', resolve);
      });

      await dataPromise;

      expect(receivedData).toBe(testData);
    });

    it('should handle empty data', async () => {
      const testData = '';
      const stream = streamingService.createDataStream(testData);

      let receivedData = '';
      const dataPromise = new Promise(resolve => {
        stream.on('data', chunk => {
          receivedData += chunk.toString();
        });
        stream.on('end', resolve);
      });

      await dataPromise;

      expect(receivedData).toBe(testData);
    });
  });
});