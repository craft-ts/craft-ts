import { TestBed } from '@angular/core/testing';
import { state } from './state';
import {
  removeOne,
  removeMany,
  upsertOne,
  upsertMany,
  addOne,
  addMany,
} from './util/entities-util';
import { insertEntities } from './insert-entities';
import { queryParam } from './query-param';
import { query } from './query';

describe('insertEntities', () => {
  it('should enable to insert entities util to a state', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = state(
        [] as string[],
        insertEntities({
          methods: [addOne, addMany, removeOne],
        }),
      );
      myState.addMany({
        newEntities: ['1', '2', '3'],
      });
    });
  });

  it('should enable to insert entities util to a queryParam', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = queryParam(
        {
          state: {
            selectedRows: {
              fallbackValue: [] as string[],
              parse: (value) => value.split(','),
              serialize: (value) => (value as string[]).join(','),
            },
          },
        },
        insertEntities({
          methods: [addOne, addMany, removeOne],
          path: 'selectedRows',
        }),
      );
      myState.addMany({
        newEntities: ['1', '2', '3'],
      });
    });
  });

  it('should enable to insert entities util to a query', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myQuery = query(
        {
          params: () => '1',
          loader: async () => ['1', '2', '3'],
        },
        insertEntities({
          methods: [addOne, addMany, removeOne],
        }),
      );
      await vi.runAllTimersAsync();
      myQuery.addMany({
        newEntities: ['4', '5', '6'],
      });
      expect(myQuery.value()).toEqual(['1', '2', '3', '4', '5', '6']);
    });
  });
  it('should enable to insert entities util to a query that run in paralllel', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myQuery = query(
        {
          params: () => '1',
          identifier: (params) => params,
          loader: async () => ['1', '2', '3'],
        },
        insertEntities({
          methods: [addOne, addMany, removeOne],
        }),
      );
      await vi.runAllTimersAsync();
      myQuery.addMany({
        select: '1',
        newEntities: ['4', '5', '6'],
      });
      expect(myQuery.select('1')?.value()).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
      ]);
    });
  });

  it('should enable to insert entities util to a query that return an object', async () => {
    await TestBed.runInInjectionContext(async () => {
      // todo same test avec identifier et select
      const myQuery = query(
        {
          params: () => '1',
          loader: async () => ({
            total: 1,
            products: [
              {
                id: '1',
                name: 'Product 1',
              },
            ],
          }),
        },
        insertEntities({
          methods: [addOne, addMany, removeOne],
          path: 'products',
        }),
      );
      await vi.runAllTimersAsync();
      myQuery.productsAddMany({
        newEntities: [
          {
            id: '4',
            name: '4',
          },
          {
            id: '5',
            name: '5',
          },
          {
            id: '6',
            name: '6',
          },
        ],
      });
      expect(myQuery.value()).toEqual([
        {
          total: 1,
          products: [
            {
              id: '1',
              name: 'Product 1',
            },
            {
              id: '4',
              name: '4',
            },
            {
              id: '5',
              name: '5',
            },
            {
              id: '6',
              name: '6',
            },
          ],
        },
      ]);
    });
  });
});
