import { spawn, spawnSync } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runPythonScript } from './runPythonScript.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../../shared/requestContext.js', () => ({
  getUserIdFromContext: () => 'test-user',
}));

vi.mock('../modules/docker/dockerWorkspace.service.js', () => ({
  dockerWorkspaceService: {
    getOrCreateWorkspace: vi.fn().mockResolvedValue({ mode: 'local-fallback' }),
  },
}));

const mockedSpawn = vi.mocked(spawn);
const mockedSpawnSync = vi.mocked(spawnSync);

describe('runPythonScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSpawn.mockReset();
    mockedSpawnSync.mockReset();
  });

  it('returns null when uv is unavailable instead of crashing', async () => {
    mockedSpawn.mockImplementation(() => {
      const error = new Error('spawn uv ENOENT');
      error.code = 'ENOENT';
      error.path = 'uv';
      throw error;
    });
    mockedSpawnSync.mockImplementation(() => ({
      error: new Error('uv missing'),
    }));

    await expect(
      runPythonScript('eia_energy', 'eia_query.py', ['petroleum'])
    ).resolves.toBeNull();
  });
});
