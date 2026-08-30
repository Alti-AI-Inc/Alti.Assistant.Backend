import { describe, expect, it } from 'vitest';
import { Space } from './space.model.js';

describe('Space model', () => {
  it('stores SearchSession and Monitor record references', () => {
    expect(Space.schema.path('searchSessions').caster.options).toMatchObject({
      ref: 'SearchSession',
    });
    expect(Space.schema.path('monitors').caster.options).toMatchObject({
      ref: 'Monitor',
    });
  });
});
