import { signal } from '@angular/core';
import { craftException, craftService } from '@craft-ng/core';

export type User = {
  id: string;
  name: string;
};

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const { ApiService } = craftService(
  { name: 'ApiService', scope: 'global' },
  () => {
    const dataList = signal<User[]>([
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
    ]);

    const throwError = signal(false);

    return {
      throwError,
      toggleUpdateError: () => throwError.update((v) => !v),
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
        dataList.set([newItem, ...dataList()]);
        return delay(newItem, 2000);
      },
      deleteItem: async (itemId: User['id']) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItem = dataList().find(
          (dataItem) => dataItem.id === itemId,
        );
        if (!deletedItem) {
          throw new Error('Item not found');
        }
        dataList.set(dataList().filter((dataItem) => dataItem.id !== itemId));
        return delay(deletedItem, 2000);
      },
      updateItem: async (updatedItem: User) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        dataList.set(
          dataList().map((dataItem) =>
            dataItem.id === updatedItem.id ? updatedItem : dataItem,
          ),
        );
        return delay(updatedItem, 2000);
      },
      bulkDelete: async (itemIds: User['id'][]) => {
        if (throwError()) {
          await delay(null, 2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItems = dataList().filter((dataItem) =>
          itemIds.includes(dataItem.id),
        );
        dataList.set(
          dataList().filter((dataItem) => !itemIds.includes(dataItem.id)),
        );
        return delay(deletedItems, 2000);
      },
    };
  },
);
