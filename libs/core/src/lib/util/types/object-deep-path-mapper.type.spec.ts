import { Expect, Equal } from 'test-type';
import { ObjectDeepPath } from './object-deep-path-mapper.type';

type User = {
  id: string;
  name: string;
  email: string;
};

it('Should map all deep object paths except arrays', () => {
  type State = {
    pagination?: {
      page: number;
      pageSize: number;
      filters?: {
        search?: string;
        sort: string;
        order: 'asc' | 'desc';
      };
    };
  };

  type AllStatePathResult = ObjectDeepPath<State>;
  const t: AllStatePathResult = 'pagination.filters';

  type ExpectAllStatePath =
    | 'pagination'
    | 'pagination.page'
    | 'pagination.pageSize'
    | 'pagination.filters'
    | 'pagination.filters.search'
    | 'pagination.filters.sort'
    | 'pagination.filters.order';

  type ExpectToGetAllStateDeepPath = Expect<
    Equal<ExpectAllStatePath, AllStatePathResult>
  >;
});

it('Should map all deep object paths that can be optional', () => {
  type State = {
    users: [];
    pagination: {
      page: number;
      pageSize: number;
      filters: {
        search: string;
        sort: string;
        order: 'asc' | 'desc';
      };
    };
    selectedUserId: string | undefined;
    propertyObject: {
      page: number;
      pageSize: number;
      filters: {
        search: string;
        sort: string;
        order: 'asc' | 'desc';
      };
    };
  };

  type AllStatePathResult = ObjectDeepPath<State>;

  type ExpectAllStatePath =
    | 'users'
    | 'pagination'
    | 'pagination.page'
    | 'pagination.pageSize'
    | 'pagination.filters'
    | 'pagination.filters.search'
    | 'pagination.filters.sort'
    | 'pagination.filters.order'
    | 'selectedUserId'
    | 'propertyObject'
    | 'propertyObject.page'
    | 'propertyObject.pageSize'
    | 'propertyObject.filters'
    | 'propertyObject.filters.search'
    | 'propertyObject.filters.sort'
    | 'propertyObject.filters.order';

  type ExpectToGetAllStateDeepPath = Expect<
    Equal<ExpectAllStatePath, AllStatePathResult>
  >;

  //@ts-expect-error it should not accept not existing path
  const ShouldNotAllowNotExistingPath: AllStatePathResult =
    'somethingNotInTheState';
});
