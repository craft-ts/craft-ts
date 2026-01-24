import { Injectable, signal } from '@angular/core';
import {
  BehaviorSubject,
  of,
  delay,
  map,
  take,
  firstValueFrom,
  timer,
  Observable,
  lastValueFrom,
} from 'rxjs';

export type User = {
  id: string;
  name: string;
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  // Not a single line of RxJS ??? Realy ahah
  private dataList$ = new BehaviorSubject<User[]>([
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

  getDataList(data: { page: number; pageSize: number }): Promise<User[]> {
    return lastValueFrom(this.dataList$.pipe(
      take(1),
      map((dataList) =>
        dataList.slice(
          (data.page - 1) * data.pageSize,
          data.page * data.pageSize
        )
      ),
      delay(2000)
    ));
  }

  getItemById(itemId: User['id']) {
    return this.dataList$.pipe(
      take(1),
      map((dataList) => {
        const item = dataList.find((dataItem) => dataItem.id === itemId);
        if (!item) {
          throw new Error(`failed to find the item ${itemId}`);
        }
        return item;
      }),
      delay(2000)
    );
  }

  addItem(newItem: User) {
    // add a radom number and return a random number
    this.dataList$.next([newItem, ...this.dataList$.value]);
    return firstValueFrom(of(newItem).pipe(delay(5000)));
  }

  deleteItem(itemId: User['id']) {
    const deletedItem = this.dataList$.value.find(
      (dataItem) => dataItem.id === itemId
    );
    if (!deletedItem) {
      throw new Error('Item not found');
    }
    this.dataList$.next(
      this.dataList$.value.filter((dataItem) => dataItem.id !== itemId)
    );
    return firstValueFrom(of(deletedItem).pipe(delay(2000)));
  }

  updateItem(updatedItem: User) {
    console.log('updatedItem', updatedItem);
    if (this.updateError()) {
      return firstValueFrom(
        timer(5000).pipe(
          map(() => {
            throw new Error('Api error during update');
          })
        )
      );
    }
    this.dataList$.next(
      this.dataList$.value.map((dataItem) =>
        dataItem.id === updatedItem.id ? updatedItem : dataItem
      )
    );
    return firstValueFrom(of(updatedItem).pipe(delay(2000)));
  }
}
