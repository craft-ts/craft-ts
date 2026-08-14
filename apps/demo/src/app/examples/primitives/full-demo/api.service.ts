import {
  craftException,
  craftGen,
  craftService,
  craftSleep,
  state
} from '@craft-ng/core';

export type User = {
  id: string;
  name: string;
};

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
        deleteItem: function* (itemId: User['id']) {
            const _state = yield* state();
                  const deletedItem = _state.find(
                    (item) => item.id === itemId,
                  );
                  if (!deletedItem) {
                    return craftException(
                      { code: 'UNEXPECTED_ERROR' },
                      { error: new Error('Item not found') },
                    );
                  }
                  yield* update((items) => items.filter((item) => item.id !== itemId));
                  return deletedItem;
                },
        updateItem: (updatedItem: User) =>
          update((items) =>
            items.map((item) =>
              item.id === updatedItem.id ? updatedItem : item,
            ),
          ),
        bulkDelete: function* (itemIds: User['id'][]) {
            const _state = yield* state();
                  const deletedItems = _state.filter((item) =>
                    itemIds.includes(item.id),
                  );
                  yield* update((items) => items.filter((item) => !itemIds.includes(item.id)));
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
      getDataList: craftGen(function* (data: {
        page: number;
        pageSize: number;
      }) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
          const _dataList = yield* dataList();
        const list = _dataList;
        const result = list.slice(
          (data.page - 1) * data.pageSize,
          data.page * data.pageSize,
        );
        yield* craftSleep(2000);
        return result;
      }),
      getItemById: craftGen(function* (itemId: User['id']) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
          const _dataList = yield* dataList();
        const list = _dataList;
        const item = list.find((dataItem) => dataItem.id === itemId);
        if (!item) {
          return craftException(
            { code: 'UNEXPECTED_ERROR' },
            { error: new Error(`failed to find the item ${itemId}`) },
          );
        }
        yield* craftSleep(2000);
        return item;
      }),
      addItem: craftGen(function* (newItem: User) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
        yield* dataList.addItem(newItem);
        yield* craftSleep(2000);
        return newItem;
      }),
      deleteItem: craftGen(function* (itemId: User['id']) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItem = yield* dataList.deleteItem(itemId);
        yield* craftSleep(2000);
        return deletedItem;
      }),
      updateItem: craftGen(function* (updatedItem: User) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
        yield* dataList.updateItem(updatedItem);
        yield* craftSleep(2000);
        return updatedItem;
      }),
      bulkDelete: craftGen(function* (itemIds: User['id'][]) {
          const _throwError = yield* throwError();
        if (_throwError) {
          yield* craftSleep(2000);
          return craftException({ code: 'HttpError' });
        }
        const deletedItems = yield* dataList.bulkDelete(itemIds);
        yield* craftSleep(2000);
        return deletedItems;
      }),
    };
  },
);
