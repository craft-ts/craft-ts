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
});
