import {
  addMany,
  addOne,
  computedIds,
  computedTotal,
  map,
  mapOne,
  removeAll,
  removeMany,
  removeOne,
  setAll,
  setMany,
  setOne,
  toggleMany,
  toggleOne,
  updateMany,
  updateOne,
  upsertMany,
  upsertOne,
} from './entities-util';

interface User {
  id: number;
  name: string;
  email?: string;
}

interface Product {
  sku: string;
  name: string;
}

const userIdentifier = (user: User) => user.id;
const productIdentifier = (product: Product) => product.sku;

describe('entities-util', () => {
  describe('removeAll', () => {
    it('should return an empty array', () => {
      expect(removeAll<User>()).toEqual([]);
    });
  });

  describe('addOne', () => {
    it('should add an entity to the end of the list', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = addOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should add to an empty list', () => {
      const result = addOne({
        entity: { id: 1, name: 'Alice' },
        entities: [],
      });
      expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    });
  });

  describe('addMany', () => {
    it('should add multiple entities to the end of the list', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = addMany({
        newEntities: [
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Charlie' },
        ],
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);
    });
  });

  describe('setAll', () => {
    it('should replace the entire list', () => {
      const result = setAll({
        newEntities: [{ id: 2, name: 'Bob' }],
      });
      expect(result).toEqual([{ id: 2, name: 'Bob' }]);
    });
  });

  describe('setOne', () => {
    it('should replace an existing entity with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setOne({
        entity: { id: 1, name: 'Alice Updated' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([{ id: 1, name: 'Alice Updated' }]);
    });

    it('should add a new entity if not found with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setOne({
        entity: { id: 1, name: 'Alice Updated' },
        entities: users,
      });
      expect(result).toEqual([{ id: 1, name: 'Alice Updated' }]);
    });

    it('should add new entity without identifier when entity has id property', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work with custom identifier for entities without id', () => {
      const products: Product[] = [{ sku: 'A1', name: 'Widget' }];
      const result = setOne({
        entity: { sku: 'A1', name: 'Widget Updated' },
        entities: products,
        identifier: productIdentifier,
      });
      expect(result).toEqual([{ sku: 'A1', name: 'Widget Updated' }]);
    });
  });

  describe('setMany', () => {
    it('should replace or add multiple entities with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setMany({
        newEntities: [
          { id: 1, name: 'Alice Updated' },
          { id: 2, name: 'Bob' },
        ],
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = setMany({
        newEntities: [
          { id: 1, name: 'Alice Updated' },
          { id: 2, name: 'Bob' },
        ],
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  describe('updateOne', () => {
    it('should partially update an existing entity with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
      ];
      const result = updateOne({
        update: { id: 1, changes: { name: 'Alice Updated' } },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated', email: 'alice@example.com' },
      ]);
    });

    it('should return the same array if entity not found', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = updateOne({
        update: { id: 99, changes: { name: 'Unknown' } },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toBe(users);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
      ];
      const result = updateOne({
        update: { id: 1, changes: { name: 'Alice Updated' } },
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated', email: 'alice@example.com' },
      ]);
    });
  });

  describe('updateMany', () => {
    it('should partially update multiple entities with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = updateMany({
        updates: [
          { id: 1, changes: { name: 'Alice Updated' } },
          { id: 2, changes: { name: 'Bob Updated' } },
        ],
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob Updated' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = updateMany({
        updates: [
          { id: 1, changes: { name: 'Alice Updated' } },
          { id: 2, changes: { name: 'Bob Updated' } },
        ],
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob Updated' },
      ]);
    });
  });

  describe('upsertOne', () => {
    it('should update an existing entity (merge) with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
      ];
      const result = upsertOne({
        entity: { id: 1, name: 'Alice Updated' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated', email: 'alice@example.com' },
      ]);
    });

    it('should add a new entity if not found with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = upsertOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
      ];
      const result = upsertOne({
        entity: { id: 1, name: 'Alice Updated' },
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated', email: 'alice@example.com' },
      ]);
    });

    it('should add new entity without identifier when entity has id property', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = upsertOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  describe('upsertMany', () => {
    it('should upsert multiple entities with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = upsertMany({
        newEntities: [
          { id: 1, name: 'Alice Updated' },
          { id: 2, name: 'Bob' },
        ],
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = upsertMany({
        newEntities: [
          { id: 1, name: 'Alice Updated' },
          { id: 2, name: 'Bob' },
        ],
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice Updated' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  describe('removeOne', () => {
    it('should remove an entity by id with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = removeOne({
        id: 1,
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([{ id: 2, name: 'Bob' }]);
    });

    it('should return the same array if entity not found', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = removeOne({
        id: 99,
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = removeOne({
        id: 1,
        entities: users,
      });
      expect(result).toEqual([{ id: 2, name: 'Bob' }]);
    });

    it('should work with custom identifier for entities without id', () => {
      const products: Product[] = [
        { sku: 'A1', name: 'Widget' },
        { sku: 'B2', name: 'Gadget' },
      ];
      const result = removeOne({
        id: 'A1',
        entities: products,
        identifier: productIdentifier,
      });
      expect(result).toEqual([{ sku: 'B2', name: 'Gadget' }]);
    });
  });

  describe('removeMany', () => {
    it('should remove multiple entities by ids with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ];
      const result = removeMany({
        ids: [1, 2],
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([{ id: 3, name: 'Charlie' }]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ];
      const result = removeMany({
        ids: [1, 2],
        entities: users,
      });
      expect(result).toEqual([{ id: 3, name: 'Charlie' }]);
    });
  });

  describe('map', () => {
    it('should apply a transformation to all entities', () => {
      const users: User[] = [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' },
      ];
      const result = map({
        mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'ALICE' },
        { id: 2, name: 'BOB' },
      ]);
    });
  });

  describe('mapOne', () => {
    it('should apply a transformation to a single entity with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' },
      ];
      const result = mapOne({
        id: 1,
        mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'ALICE' },
        { id: 2, name: 'bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' },
      ];
      const result = mapOne({
        id: 1,
        mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'ALICE' },
        { id: 2, name: 'bob' },
      ]);
    });

    it('should not transform if entity not found', () => {
      const users: User[] = [{ id: 1, name: 'alice' }];
      const result = mapOne({
        id: 99,
        mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
        entities: users,
      });
      expect(result).toEqual([{ id: 1, name: 'alice' }]);
    });
  });

  describe('computedTotal', () => {
    it('should return the total count of entities', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      expect(computedTotal({ entities: users })).toBe(2);
    });

    it('should return 0 for empty list', () => {
      expect(computedTotal({ entities: [] })).toBe(0);
    });
  });

  describe('computedIds', () => {
    it('should return all ids with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = computedIds({
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([1, 2]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = computedIds({ entities: users });
      expect(result).toEqual([1, 2]);
    });

    it('should work with custom identifier for entities without id', () => {
      const products: Product[] = [
        { sku: 'A1', name: 'Widget' },
        { sku: 'B2', name: 'Gadget' },
      ];
      const result = computedIds({
        entities: products,
        identifier: productIdentifier,
      });
      expect(result).toEqual(['A1', 'B2']);
    });

    it('should return empty array for empty list', () => {
      const result = computedIds({
        entities: [] as User[],
        identifier: userIdentifier,
      });
      expect(result).toEqual([]);
    });
  });

  describe('primitives support', () => {
    describe('string[]', () => {
      it('setOne should replace an existing string', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = setOne({ entity: 'svelte', entities: tags });
        expect(result).toEqual(['angular', 'react', 'vue', 'svelte']);
      });

      it('setOne should not duplicate an existing string', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = setOne({ entity: 'react', entities: tags });
        expect(result).toEqual(['angular', 'react', 'vue']);
      });

      it('setMany should replace or add multiple strings', () => {
        const tags: string[] = ['angular', 'react'];
        const result = setMany({
          newEntities: ['react', 'vue', 'svelte'],
          entities: tags,
        });
        expect(result).toEqual(['angular', 'react', 'vue', 'svelte']);
      });

      it('removeOne should remove a string', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = removeOne({ id: 'react', entities: tags });
        expect(result).toEqual(['angular', 'vue']);
      });

      it('removeOne should return same array if string not found', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = removeOne({ id: 'svelte', entities: tags });
        expect(result).toEqual(['angular', 'react', 'vue']);
      });

      it('removeMany should remove multiple strings', () => {
        const tags: string[] = ['angular', 'react', 'vue', 'svelte'];
        const result = removeMany({ ids: ['react', 'svelte'], entities: tags });
        expect(result).toEqual(['angular', 'vue']);
      });

      it('upsertOne should add a new string', () => {
        const tags: string[] = ['angular', 'react'];
        const result = upsertOne({ entity: 'vue', entities: tags });
        expect(result).toEqual(['angular', 'react', 'vue']);
      });

      it('upsertOne should not duplicate an existing string', () => {
        const tags: string[] = ['angular', 'react'];
        const result = upsertOne({ entity: 'react', entities: tags });
        expect(result).toEqual(['angular', 'react']);
      });

      it('upsertMany should upsert multiple strings', () => {
        const tags: string[] = ['angular', 'react'];
        const result = upsertMany({
          newEntities: ['react', 'vue'],
          entities: tags,
        });
        expect(result).toEqual(['angular', 'react', 'vue']);
      });

      it('mapOne should transform a single string', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = mapOne({
          id: 'react',
          mapFn: (t) => t.toUpperCase(),
          entities: tags,
        });
        expect(result).toEqual(['angular', 'REACT', 'vue']);
      });

      it('computedIds should return the strings themselves', () => {
        const tags: string[] = ['angular', 'react', 'vue'];
        const result = computedIds({ entities: tags });
        expect(result).toEqual(['angular', 'react', 'vue']);
      });
    });

    describe('number[]', () => {
      it('setOne should replace an existing number', () => {
        const numbers: number[] = [1, 2, 3];
        const result = setOne({ entity: 4, entities: numbers });
        expect(result).toEqual([1, 2, 3, 4]);
      });

      it('setOne should not duplicate an existing number', () => {
        const numbers: number[] = [1, 2, 3];
        const result = setOne({ entity: 2, entities: numbers });
        expect(result).toEqual([1, 2, 3]);
      });

      it('setMany should replace or add multiple numbers', () => {
        const numbers: number[] = [1, 2];
        const result = setMany({
          newEntities: [2, 3, 4],
          entities: numbers,
        });
        expect(result).toEqual([1, 2, 3, 4]);
      });

      it('removeOne should remove a number', () => {
        const numbers: number[] = [1, 2, 3];
        const result = removeOne({ id: 2, entities: numbers });
        expect(result).toEqual([1, 3]);
      });

      it('removeOne should return same array if number not found', () => {
        const numbers: number[] = [1, 2, 3];
        const result = removeOne({ id: 99, entities: numbers });
        expect(result).toEqual([1, 2, 3]);
      });

      it('removeMany should remove multiple numbers', () => {
        const numbers: number[] = [1, 2, 3, 4, 5];
        const result = removeMany({ ids: [2, 4], entities: numbers });
        expect(result).toEqual([1, 3, 5]);
      });

      it('upsertOne should add a new number', () => {
        const numbers: number[] = [1, 2];
        const result = upsertOne({ entity: 3, entities: numbers });
        expect(result).toEqual([1, 2, 3]);
      });

      it('upsertOne should not duplicate an existing number', () => {
        const numbers: number[] = [1, 2];
        const result = upsertOne({ entity: 2, entities: numbers });
        expect(result).toEqual([1, 2]);
      });

      it('upsertMany should upsert multiple numbers', () => {
        const numbers: number[] = [1, 2];
        const result = upsertMany({
          newEntities: [2, 3],
          entities: numbers,
        });
        expect(result).toEqual([1, 2, 3]);
      });

      it('mapOne should transform a single number', () => {
        const numbers: number[] = [1, 2, 3];
        const result = mapOne({
          id: 2,
          mapFn: (n) => n * 10,
          entities: numbers,
        });
        expect(result).toEqual([1, 20, 3]);
      });

      it('computedIds should return the numbers themselves', () => {
        const numbers: number[] = [1, 2, 3];
        const result = computedIds({ entities: numbers });
        expect(result).toEqual([1, 2, 3]);
      });
    });
  });

  describe('toggleOne', () => {
    it('should remove an existing entity with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toggleOne({
        entity: { id: 1, name: 'Alice' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([{ id: 2, name: 'Bob' }]);
    });

    it('should add a non-existing entity with identifier', () => {
      const users: User[] = [{ id: 1, name: 'Alice' }];
      const result = toggleOne({
        entity: { id: 2, name: 'Bob' },
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toggleOne({
        entity: { id: 1, name: 'Alice' },
        entities: users,
      });
      expect(result).toEqual([{ id: 2, name: 'Bob' }]);
    });

    it('should add to empty list', () => {
      const result = toggleOne({
        entity: { id: 1, name: 'Alice' },
        entities: [],
      });
      expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should work with custom identifier for entities without id', () => {
      const products: Product[] = [{ sku: 'A1', name: 'Widget' }];
      const result = toggleOne({
        entity: { sku: 'A1', name: 'Widget' },
        entities: products,
        identifier: productIdentifier,
      });
      expect(result).toEqual([]);
    });

    it('should work with primitives (strings)', () => {
      const tags: string[] = ['a', 'b', 'c'];
      const result = toggleOne({
        entity: 'b',
        entities: tags,
      });
      expect(result).toEqual(['a', 'c']);
    });

    it('should add primitive if not present', () => {
      const tags: string[] = ['a', 'c'];
      const result = toggleOne({
        entity: 'b',
        entities: tags,
      });
      expect(result).toEqual(['a', 'c', 'b']);
    });

    it('should work with primitives (numbers)', () => {
      const numbers: number[] = [1, 2, 3];
      const result = toggleOne({
        entity: 2,
        entities: numbers,
      });
      expect(result).toEqual([1, 3]);
    });
  });

  describe('toggleMany', () => {
    it('should toggle multiple entities with identifier', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toggleMany({
        newEntities: [
          { id: 1, name: 'Alice' },
          { id: 3, name: 'Charlie' },
        ],
        entities: users,
        identifier: userIdentifier,
      });
      expect(result).toEqual([
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);
    });

    it('should work without identifier when entity has id property', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toggleMany({
        newEntities: [
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Charlie' },
        ],
        entities: users,
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 3, name: 'Charlie' },
      ]);
    });

    it('should add all entities to empty list', () => {
      const result = toggleMany({
        newEntities: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        entities: [],
      });
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should remove all entities when all exist', () => {
      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toggleMany({
        newEntities: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        entities: users,
      });
      expect(result).toEqual([]);
    });

    it('should work with primitives (strings)', () => {
      const tags: string[] = ['a', 'b', 'c'];
      const result = toggleMany({
        newEntities: ['b', 'd'],
        entities: tags,
      });
      expect(result).toEqual(['a', 'c', 'd']);
    });

    it('should work with primitives (numbers)', () => {
      const numbers: number[] = [1, 2, 3];
      const result = toggleMany({
        newEntities: [2, 4],
        entities: numbers,
      });
      expect(result).toEqual([1, 3, 4]);
    });
  });
});
