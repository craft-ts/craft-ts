import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { removeOne, addOne, addMany, setOne } from './util/entities-util';
import { insertEntities } from './insert-entities';
import { queryParams } from './query-params';
import { query } from './query';
import { provideRouter } from '@angular/router';
import { craftUse } from './craft-use';

describe('insertEntities', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it('should enable to insert entities util to a state', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = craftUse(state(
          'myState',
          [] as string[],
          insertEntities({
            methods: [addOne, addMany, removeOne],
          }),
        ),
      );
      myState.addMany({
        newEntities: ['1', '2', '3'],
      });
    });
  });

  it('should enable to insert entities util to a queryParams', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
    await TestBed.runInInjectionContext(async () => {
      const myState = craftUse(queryParams(
          'myState',
          {
            state: {
              selectedRows: {
                fallbackValue: [] as string[],
                codec: {
                  decode: (value: string) => value.split(','),
                  encode: (value: string[]) => value.join(','),
                },
              },
            },
          },
          insertEntities({
            methods: [addOne, addMany, removeOne],
            path: 'selectedRows',
          }),
        ),
      );
      myState.selectedRowsAddMany({
        newEntities: ['1', '2', '3'],
      });
    });
  });

  it('should enable to insert entities util to a query', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myQuery = craftUse(query(
          'myQuery',
          {
            params: () => '1',
            loader: async () => ['1', '2', '3'],
          },
          insertEntities({
            methods: [addOne, addMany, removeOne],
          }),
        ),
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
      const myQuery = craftUse(query(
          'myQuery',
          {
            params: () => '1',
            identifier: (params) => params,
            loader: async () => ['1', '2', '3'],
          },
          insertEntities({
            methods: [addOne, addMany, removeOne],
          }),
        ),
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
      const myQuery = craftUse(query(
          'myQuery',
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
        ),
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
      expect(myQuery.value()).toEqual({
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
      });
    });
  });
  it('should enable to insert entities util to parallel queries that return an object', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myQuery = craftUse(query(
          'myQuery',
          {
            params: () => '1',
            identifier: (params) => params,
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
        ),
      );
      await vi.runAllTimersAsync();
      myQuery.productsAddMany({
        select: '1',
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
      expect(myQuery.select('1')?.value()).toEqual({
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
      });
    });
  });

  it('should update a nested dotted path on state', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = craftUse(state(
          'myState',
          {
            catalog: {
              products: [
                {
                  id: '1',
                  name: 'Product 1',
                },
              ],
            },
            total: 1,
          },
          insertEntities({
            methods: [addMany],
            path: 'catalog.products',
          }),
        ),
      );

      myState.catalogProductsAddMany({
        newEntities: [
          {
            id: '2',
            name: 'Product 2',
          },
        ],
      });

      expect(myState()).toEqual({
        catalog: {
          products: [
            {
              id: '1',
              name: 'Product 1',
            },
            {
              id: '2',
              name: 'Product 2',
            },
          ],
        },
        total: 1,
      });
    });
  });

  it('should forward a custom identifier to helper methods', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = craftUse(state(
          'myState',
          [] as Array<{ uuid: string; name: string }>,
          insertEntities({
            methods: [setOne],
            identifier: (entity) => entity.uuid,
          }),
        ),
      );

      myState.setOne({
        entity: {
          uuid: '1',
          name: 'Product 1',
        },
      });
      myState.setOne({
        entity: {
          uuid: '1',
          name: 'Product 1 updated',
        },
      });

      expect(myState()).toEqual([
        {
          uuid: '1',
          name: 'Product 1 updated',
        },
      ]);
    });
  });
});
