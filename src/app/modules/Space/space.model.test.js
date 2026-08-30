import { describe, expect, it } from 'vitest';
import { Space } from './space.model.js';

describe('Space model', () => {
  it('stores Exa Search and Monitor record references', () => {
    expect(Space.schema.path('searches').caster.options).toMatchObject({
      ref: 'ExaSearch',
    });
    expect(Space.schema.path('monitors').caster.options).toMatchObject({
      ref: 'Monitor',
    });
  });
});
