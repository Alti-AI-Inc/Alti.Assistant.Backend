import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to declare mock instances so they are available inside vi.mock factories
const hoistedMocks = vi.hoisted(() => {
  const mockSftp = {
    writeFile: vi.fn().mockImplementation((path, content, cb) => cb(null)),
    readFile: vi.fn().mockImplementation((path, cb) => cb(null, Buffer.from('mock remote content'))),
    readdir: vi.fn().mockImplementation(
      (path, cb) => cb(null, [{ filename: 'file1.remote' }, { filename: 'file2.remote' }])
    ),
  };

  const mockStream = {
    on: vi.fn(function(event, cb) {
      if (event === 'close') {
        process.nextTick(() => cb(0, null)); // Exit code 0
      }
      return this;
    }),
    stderr: {
      on: vi.fn(),
    },
  };

  const mockClientInstance = {
    on: vi.fn(function(event, cb) {
      if (event === 'ready') {
        process.nextTick(cb);
      }
      return this;
    }),
    connect: vi.fn(),
    exec: vi.fn().mockImplementation((cmd, cb) => {
      process.nextTick(() => cb(null, mockStream));
    }),
    sftp: vi.fn().mockImplementation((cb) => {
      process.nextTick(() => cb(null, mockSftp));
    }),
    end: vi.fn(),
  };

  // Constructible Client mock
  const MockClientConstructor = vi.fn(function() {
    return mockClientInstance;
  });

  return {
    mockSftp,
    mockStream,
    mockClientInstance,
    MockClientConstructor,
  };
});

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    sandbox: {
      enabled: false,
      host: '10.0.0.2',
      port: 22,
      username: 'test-user',
      privateKey: 'test-key',
      basePath: '/workspace/tenants',
    },
  },
}));

// Mock child_process exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs synchronously for ESM hoisting compatibility
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockImplementation(() => 'mock file content'),
    existsSync: vi.fn().mockImplementation(() => true),
    readdirSync: vi.fn().mockImplementation(() => ['file1.txt', 'file2.txt']),
  },
}));

// Mock ssh2 using the hoisted constructible MockClientConstructor
vi.mock('ssh2', () => ({
  Client: hoistedMocks.MockClientConstructor,
}));

import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import config from '../../../../config/index.js';
import { gcpSandboxService } from './gcp-sandbox.service.js';

const { mockSftp, mockStream, mockClientInstance, MockClientConstructor } = hoistedMocks;

describe('GcpSandboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.sandbox.enabled = false; // default to disabled for fallback tests
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Local Fallback Mode (sandbox.enabled = false)', () => {
    it('should run command locally using child_process exec', async () => {
      exec.mockImplementationOnce((cmd, opts, cb) => {
        cb(null, 'local stdout', 'local stderr');
      });

      const res = await gcpSandboxService.executeCommand('tenant123', 'echo "Hello"');

      expect(res).toEqual({
        success: true,
        stdout: 'local stdout',
        stderr: 'local stderr',
        code: 0,
      });
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(
        'echo "Hello"',
        expect.objectContaining({ cwd: expect.stringContaining('tenant123') }),
        expect.any(Function)
      );
    });

    it('should write file locally using fs writeFileSync', async () => {
      await gcpSandboxService.writeFile('tenant123', 'test.txt', 'hello content');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        'hello content'
      );
    });

    it('should read file locally using fs readFileSync', async () => {
      const res = await gcpSandboxService.readFile('tenant123', 'test.txt');

      expect(res).toBe('mock file content');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        'utf-8'
      );
    });

    it('should list directory locally using fs readdirSync', async () => {
      const res = await gcpSandboxService.listDirectory('tenant123', 'src');

      expect(res).toEqual(['file1.txt', 'file2.txt']);
      expect(fs.readdirSync).toHaveBeenCalledWith(expect.stringContaining('src'));
    });
  });

  describe('Sandbox Execution Mode (sandbox.enabled = true)', () => {
    beforeEach(() => {
      config.sandbox.enabled = true;
    });

    it('should connect via SSH, create script, execute inside Docker container, and clean up', async () => {
      const res = await gcpSandboxService.executeCommand('tenant123', 'python run.py');

      expect(res.success).toBe(true);
      expect(MockClientConstructor).toHaveBeenCalled();
      expect(mockClientInstance.connect).toHaveBeenCalledWith(expect.objectContaining({
        host: '10.0.0.2',
        username: 'test-user',
        privateKey: 'test-key',
      }));

      // Verify directory creation on VM
      expect(mockClientInstance.exec).toHaveBeenCalledWith(
        'mkdir -p "/workspace/tenants/tenant123"',
        expect.any(Function)
      );

      // Verify file writing via SFTP
      expect(mockSftp.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/workspace/tenants/tenant123/.run_'),
        'python run.py',
        expect.any(Function)
      );

      // Verify Docker execution
      expect(mockClientInstance.exec).toHaveBeenCalledWith(
        expect.stringContaining('docker run --rm -v "/workspace/tenants/tenant123":/app -w /app'),
        expect.any(Function)
      );

      // Verify script cleanup
      expect(mockClientInstance.exec).toHaveBeenCalledWith(
        expect.stringContaining('rm -f "/workspace/tenants/tenant123/.run_'),
        expect.any(Function)
      );

      expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
    });

    it('should write remote file via SFTP', async () => {
      await gcpSandboxService.writeFile('tenant123', 'src/app.py', 'print("ok")');

      // Verify parent dir creation on VM
      expect(mockClientInstance.exec).toHaveBeenCalledWith(
        'mkdir -p "/workspace/tenants/tenant123/src"',
        expect.any(Function)
      );

      expect(mockSftp.writeFile).toHaveBeenCalledWith(
        '/workspace/tenants/tenant123/src/app.py',
        'print("ok")',
        expect.any(Function)
      );
    });

    it('should read remote file via SFTP', async () => {
      const res = await gcpSandboxService.readFile('tenant123', 'app.py');

      expect(res).toBe('mock remote content');
      expect(mockSftp.readFile).toHaveBeenCalledWith(
        '/workspace/tenants/tenant123/app.py',
        expect.any(Function)
      );
    });

    it('should list remote directory via SFTP readdir', async () => {
      const res = await gcpSandboxService.listDirectory('tenant123', 'subdir');

      expect(res).toEqual(['file1.remote', 'file2.remote']);
      expect(mockSftp.readdir).toHaveBeenCalledWith(
        '/workspace/tenants/tenant123/subdir',
        expect.any(Function)
      );
    });
  });
});
