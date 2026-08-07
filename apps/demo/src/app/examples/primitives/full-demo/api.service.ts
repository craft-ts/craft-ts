import { craftException, craftService, craftUse, state } from '@craft-ng/core';

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
    const dataList = yield* state(
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
        bulkDelete: (itemIds: User['id'][]) => {
          const deletedItems = state().filter((item) =>
            itemIds.includes(item.id),
          );
          update((items) => items.filter((item) => !itemIds.includes(item.id)));
          return deletedItems;
        },
      }),
    );

    const throwError = yield* state('throwError', false, ({ update }) => ({
      toggleUpdateError: () => update((value) => !value),
    }));

    return {
      throwError,
      toggleUpdateError: () => throwError.toggleUpdateError(),
      getDataList: async (data: { page: number; pageSize: number }) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const list = dataList();
        const result = list.slice(
          (data.page - 1) * data.pageSize,
          data.page * data.pageSize,
        );
        return delay(result, 2000);
      },
      getItemById: async (itemId: User['id']) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const list = dataList();
        const item = list.find((dataItem) => dataItem.id === itemId);
        if (!item) {
          throw new Error(`failed to find the item ${itemId}`);
        }
        return delay(item, 2000);
      },
      addItem: async (newItem: User) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        craftUse(dataList.addItem(newItem));
        return delay(newItem, 2000);
      },
      deleteItem: async (itemId: User['id']) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItem = craftUse(dataList.deleteItem(itemId));
        return delay(deletedItem, 2000);
      },
      updateItem: async (updatedItem: User) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        craftUse(dataList.updateItem(updatedItem));
        return delay(updatedItem, 2000);
      },
      bulkDelete: async (itemIds: User['id'][]) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItems = craftUse(dataList.bulkDelete(itemIds));
        return delay(deletedItems, 2000);
      },
    };
  },
);
