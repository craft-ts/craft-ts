import { describe, expect, it } from 'vitest';
import {
  childCraftRenderIdentity,
  createCraftRenderIdentity,
  ɵchildCraftRenderIdentity,
  type CraftRenderIdentity,
} from './craft-render-identity';

// The key a child gets must be byte for byte the key of its full path,
// whatever way the runtime builds it. An identity derives its path and key
// when they are read, so two identities are compared by what they answer.
const plain = (identity: CraftRenderIdentity) => ({
  path: [...identity.path],
  hydrationKey: identity.hydrationKey,
});

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
          expect(plain(grandchild)).toEqual(plain(expected));
          expect(child.path).toEqual([...root, ...first].map(String));
          expect(
            plain(ɵchildCraftRenderIdentity(parent, first[0], first[1])),
          ).toEqual(
            plain(createCraftRenderIdentity([...root, ...first.slice(0, 2)])),
          );
        }
  });

  it('builds the full key for a structural parent supplied by a caller', () => {
    const structural: CraftRenderIdentity = {
      path: ['x', 'y'],
      hydrationKey: 'not-derived-from-path',
    };
    expect(plain(childCraftRenderIdentity(structural, 'z'))).toEqual({
      path: ['x', 'y', 'z'],
      hydrationKey: 'x/y/z',
    });
    expect(plain(ɵchildCraftRenderIdentity(structural, 'z'))).toEqual({
      path: ['x', 'y', 'z'],
      hydrationKey: 'x/y/z',
    });
  });

  it('rejects a malformed segment when the child is created', () => {
    const parent = createCraftRenderIdentity(['app']);
    expect(() => childCraftRenderIdentity(parent, '\uD800')).toThrow(URIError);
    expect(() => createCraftRenderIdentity(['\uDC00'])).toThrow(URIError);
    expect(() => ɵchildCraftRenderIdentity(parent, 'ok', '\uD800')).toThrow(
      URIError,
    );
  });

  it('does not share the path array of the parent', () => {
    const parent = createCraftRenderIdentity(['app']);
    const child = childCraftRenderIdentity(parent);
    expect(plain(child)).toEqual(plain(parent));
    expect(child.path).not.toBe(parent.path);
  });

  it('answers the same path and key however often they are read', () => {
    const child = childCraftRenderIdentity(
      createCraftRenderIdentity(['app', 0]),
      'item:a/b',
    );
    expect(child.hydrationKey).toBe('app/0/item%3Aa%252Fb');
    expect(child.path).toBe(child.path);
    expect(JSON.parse(JSON.stringify(child))).toEqual({
      path: ['app', '0', 'item:a/b'],
      hydrationKey: 'app/0/item%3Aa%252Fb',
    });
  });
});
