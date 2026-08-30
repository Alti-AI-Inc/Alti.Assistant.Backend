import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Space } from '../Space/space.model.js';
import { Monitor } from './Monitor.model.js';
import { MonitorService } from './monitor.service.js';
import { SpaceService } from './space.service.js';

vi.mock('../Space/space.model.js', () => ({
  Space: { findByIdAndUpdate: vi.fn() },
}));

vi.mock('./Monitor.model.js', () => ({
  Monitor: { create: vi.fn() },
}));

vi.mock('./space.service.js', () => ({
  SpaceService: { assertSpaceAccess: vi.fn() },
}));

vi.mock('./monitorRun.model.js', () => ({
  MonitorRun: { deleteMany: vi.fn() },
}));

describe('MonitorService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the created monitor ID to its owning space', async () => {
    Monitor.create.mockResolvedValue({ _id: 'monitor-1' });

    await MonitorService.createMonitorRecord('space-1', 'user-1', {
      exaMonitorId: 'exa-monitor-1',
    });

    expect(SpaceService.assertSpaceAccess).toHaveBeenCalledWith(
      'space-1',
      'user-1',
      'editor'
    );
    expect(Space.findByIdAndUpdate).toHaveBeenCalledWith('space-1', {
      $addToSet: { monitors: 'monitor-1' },
    });
  });
});
