import { describe, expect, it } from 'vitest';
import { Space } from './space.model.js';

describe('Space model', () => {
  it('stores search, deep research, monitor session, and monitor references', () => {
    expect(Space.schema.path('searchSessions').caster.options).toMatchObject({
      ref: 'SearchSession',
    });
    expect(
      Space.schema.path('deepResearchSessions').caster.options
    ).toMatchObject({
      ref: 'DeepResearchSession',
    });
    expect(Space.schema.path('monitorSessions').caster.options).toMatchObject({
      ref: 'monitor-session',
    });
    expect(Space.schema.path('monitors').caster.options).toMatchObject({
      ref: 'Monitor',
    });
  });
});
