import { describe, expect, it } from 'vitest';
import { SearchSession } from './searchSession.model.js';

describe('SearchSession model', () => {
  it('stores Exa Search record references', () => {
    expect(SearchSession.schema.path('searches').caster.options).toMatchObject({
      ref: 'Exa-Search',
    });
  });
});
