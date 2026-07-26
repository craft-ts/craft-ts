import { signal } from '@angular/core';
import { craftService } from '@craft-ng/core';

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

    const updateError = signal(false);

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
        dataList.set([newItem, ...dataList()]);
        return delay(newItem, 5000);
      },
      deleteItem: async (itemId: User['id']): Promise<User> => {
        const deletedItem = dataList().find(
          (dataItem) => dataItem.id === itemId,
        );
        if (!deletedItem) {
          throw new Error('Item not found');
        }
        dataList.set(dataList().filter((dataItem) => dataItem.id !== itemId));
        return delay(deletedItem, 2000);
      },
      updateItem: async (updatedItem: User): Promise<User> => {
        if (updateError()) {
          await delay(null, 5000);
          throw new Error('Api error during update');
        }
        dataList.set(
          dataList().map((dataItem) =>
            dataItem.id === updatedItem.id ? updatedItem : dataItem,
          ),
        );
        return delay(updatedItem, 2000);
      },
      bulkDelete: async (itemIds: User['id'][]): Promise<User[]> => {
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
