import { describe, expect, it } from 'vitest';
import { primitiveKindFromHostTag } from './event-types';

describe('primitiveKindFromHostTag', () => {
  it('extracts kind and name from innermost tag', () => {
    expect(primitiveKindFromHostTag(['method:addTodo'])).toEqual({
      kind: 'method',
      name: 'addTodo',
    });
    expect(primitiveKindFromHostTag(['service:Todos', 'mutation:save'])).toEqual({
      kind: 'mutation',
      name: 'save',
    });
    expect(primitiveKindFromHostTag(['query:user'])).toEqual({
      kind: 'query',
      name: 'user',
    });
  });

  it('falls back to unknown when no prefix matches', () => {
    expect(primitiveKindFromHostTag(['foo:bar'])).toEqual({
      kind: 'unknown',
      name: 'foo:bar',
    });
  });

  it('handles empty host tag', () => {
    expect(primitiveKindFromHostTag([])).toEqual({
      kind: 'unknown',
      name: '',
    });
  });
});
