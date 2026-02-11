import { Injectable, signal } from '@angular/core';

export type User = {
  id: string;
  name: string;
};

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private dataList = signal<User[]>([
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

  public readonly updateError = signal(false);

  async getDataList(data: { page: number; pageSize: number }): Promise<User[]> {
    const dataList = this.dataList();
    const result = dataList.slice(
      (data.page - 1) * data.pageSize,
      data.page * data.pageSize,
    );
    return delay(result, 2000);
  }

  async getItemById(itemId: User['id']): Promise<User> {
    const dataList = this.dataList();
    const item = dataList.find((dataItem) => dataItem.id === itemId);
    if (!item) {
      throw new Error(`failed to find the item ${itemId}`);
    }
    return delay(item, 2000);
  }

  async addItem(newItem: User): Promise<User> {
    this.dataList.set([newItem, ...this.dataList()]);
    return delay(newItem, 5000);
  }

  async deleteItem(itemId: User['id']): Promise<User> {
    const deletedItem = this.dataList().find(
      (dataItem) => dataItem.id === itemId,
    );
    if (!deletedItem) {
      throw new Error('Item not found');
    }
    this.dataList.set(
      this.dataList().filter((dataItem) => dataItem.id !== itemId),
    );
    return delay(deletedItem, 2000);
  }

  async updateItem(updatedItem: User): Promise<User> {
    if (this.updateError()) {
      await delay(null, 5000);
      throw new Error('Api error during update');
    }
    this.dataList.set(
      this.dataList().map((dataItem) =>
        dataItem.id === updatedItem.id ? updatedItem : dataItem,
      ),
    );
    return delay(updatedItem, 2000);
  }
}
