import { describe, expect, it } from 'vitest';
import {
  childCraftRenderIdentity,
  createCraftRenderIdentity,
  type CraftRenderIdentity,
} from './craft-render-identity';

// The key a child gets must be byte for byte the key of its full path,
// whatever way the runtime builds it.
describe('Craft render identities', () => {
  const segments: readonly (string | number)[][] = [
    ['app'],
    ['component:Row', 'item:1'],
    ['a/b', 'c%2Fd'],
    [''],
    ['', ''],
    ['é', '日本', '🙂'],
    [0, -1, 1.5],
    ['item:undefined', 'null'],
    [],
  ];

  it('derives the key of a full path through any chain of children', () => {
    for (const root of segments)
      for (const first of segments)
        for (const second of segments) {
          const parent = createCraftRenderIdentity(root);
          const child = childCraftRenderIdentity(parent, ...first);
          const grandchild = childCraftRenderIdentity(child, ...second);
          const expected = createCraftRenderIdentity([
            ...root,
            ...first,
            ...second,
          ]);
          expect(grandchild).toEqual(expected);
          expect(child.path).toEqual([...root, ...first].map(String));
        }
  });

  it('builds the full key for a structural parent supplied by a caller', () => {
    const structural: CraftRenderIdentity = {
      path: ['x', 'y'],
      hydrationKey: 'not-derived-from-path',
    };
    expect(childCraftRenderIdentity(structural, 'z')).toEqual(
      createCraftRenderIdentity(['x', 'y', 'z']),
    );
  });

  it('rejects a malformed segment when the child is created', () => {
    const parent = createCraftRenderIdentity(['app']);
    expect(() => childCraftRenderIdentity(parent, '\uD800')).toThrow(URIError);
    expect(() => createCraftRenderIdentity(['\uDC00'])).toThrow(URIError);
  });

  it('does not share the path array of the parent', () => {
    const parent = createCraftRenderIdentity(['app']);
    const child = childCraftRenderIdentity(parent);
    expect(child).toEqual(parent);
    expect(child.path).not.toBe(parent.path);
  });
});
