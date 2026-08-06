import { craftService, state } from '@craft-ng/core';

export type User = {
  id: string;
  name: string;
};

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const { ApiService } = craftService(
  { name: 'ApiService', scope: 'global' },
  function* () {
    const { dataList } = yield* state(
      'dataList',
      [
        { id: '1', name: 'Romain' },
        { id: '2', name: 'Geffrault' },
        { id: '3', name: 'Rom1' },
        { id: '4', name: 'Daniel' },
        { id: '5', name: 'Toto' },
        { id: '6', name: 'Julien' },
        { id: '7', name: 'Kev' },
        { id: '8', name: 'Lulu' },
        { id: '9', name: 'Timou' },
        { id: '10', name: 'Lupette' },
      ] as User[],
      ({ state, update }) => ({
        addItem: (newItem: User) => update((items) => [newItem, ...items]),
        deleteItem: (itemId: User['id']) => {
          const deletedItem = state().find((item) => item.id === itemId);
          if (!deletedItem) {
            throw new Error('Item not found');
          }
          update((items) => items.filter((item) => item.id !== itemId));
          return deletedItem;
        },
        updateItem: (updatedItem: User) =>
          update((items) =>
            items.map((item) =>
              item.id === updatedItem.id ? updatedItem : item,
            ),
          ),
      }),
    );

    const { updateError } = yield* state('updateError', false);

    return {
      updateError,
      getDataList: async (data: {
        page: number;
        pageSize: number;
      }): Promise<User[]> => {
        const list = dataList();
        const result = list.slice(
          (data.page - 1) * data.pageSize,
          data.page * data.pageSize,
        );
        return delay(result, 2000);
      },
      getItemById: async (itemId: User['id']): Promise<User> => {
        const list = dataList();
        const item = list.find((dataItem) => dataItem.id === itemId);
        if (!item) {
          throw new Error(`failed to find the item ${itemId}`);
        }
        return delay(item, 2000);
      },
      addItem: async (newItem: User): Promise<User> => {
        dataList.addItem(newItem);
        return delay(newItem, 5000);
      },
      deleteItem: async (itemId: User['id']): Promise<User> => {
        const deletedItem = dataList.deleteItem(itemId);
        return delay(deletedItem, 2000);
      },
      updateItem: async (updatedItem: User): Promise<User> => {
        if (updateError()) {
          await delay(null, 3000);
          throw new Error('Api error during update');
        }
        dataList.updateItem(updatedItem);
        return delay(updatedItem, 2000);
      },
    };
  },
);
