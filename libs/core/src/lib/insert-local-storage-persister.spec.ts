import { TestBed } from '@angular/core/testing';
import { asyncProcess } from './async-process';
import { insertLocalStoragePersister } from './insert-local-storage-persister';
import { mutation } from './mutation';
import { query } from './query';
import { state } from './state';

describe('insertLocalStoragePersister', () => {
  it('can be used as an insertion in a query', async () => {
    TestBed.runInInjectionContext(() => {
      const myQuery = query(
        {
          params: () => 'test',
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myTestQuery',
        }),
      );

      const myQuery2 = query(
        {
          params: () => 'test',
          identifier: (params) => params,
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myTestQuery2',
        }),
      );
    });
  });

  it('can be used as an insertion in a mutation', async () => {
    TestBed.runInInjectionContext(() => {
      const myMutation = mutation(
        {
          method: () => 'test',
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myMutation',
        }),
      );
      const myMutation2 = mutation(
        {
          method: () => 'test',
          identifier: (params) => params,
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myMutation2',
        }),
      );
    });
  });

  it('can be used as an insertion in a async method', async () => {
    TestBed.runInInjectionContext(() => {
      const myAsyncProcess = asyncProcess(
        {
          method: () => 'test',
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myAsyncProcess',
        }),
      );
      const myAsyncProcess2 = asyncProcess(
        {
          method: () => 'test',
          identifier: (params) => params,
          loader: async () => {
            return { data: 'testData' };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myAsyncProcess2',
        }),
      );
    });
  });

  it('can be used as an insertion in a state', async () => {
    TestBed.runInInjectionContext(() => {
      const myState = state(
        0,
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myState',
        }),
      );
    });
  });
});
