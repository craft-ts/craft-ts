import { Expect, Equal } from 'test-type';
import {
  AccessTypeObjectPropertyByDottedPath,
  DottedPathPathToTuple,
} from './access-type-object-property-by-dotted-path.type';

it('Should make a tuple from dotted path', () => {
  type DottedPath = 'pagination.filters.search';
  type TupleFromDottedPath = DottedPathPathToTuple<DottedPath>;
  const t: TupleFromDottedPath = ['pagination', 'filters', 'search'];

  type ExpectToGetTupleFromDottedPath = Expect<
    Equal<TupleFromDottedPath, ['pagination', 'filters', 'search']>
  >;
});

it('Should access to the object type by dottedPath', () => {
  type State = {
    pagination: {
      filters: {
        advancedFilters?: {
          group1?: {
            search: string;
            sort?: string;
            order: 'asc' | 'desc';
          };
          group2: {
            userName?: string;
            sort?: string;
            order?: 'asc' | 'desc';
          };
        };
      };
    };
  };

  type AccessedProperty = AccessTypeObjectPropertyByDottedPath<
    State,
    DottedPathPathToTuple<'pagination.filters.advancedFilters.group1'>
  >;

  type ExpectToAccessThePropertyByDottedPath = Expect<
    Equal<
      AccessedProperty,
      {
        search: string;
        sort?: string;
        order: 'asc' | 'desc';
      }
    >
  >;
});

it('Should return "ErrorTypeNotFound" if the path does not match', () => {
  type State = {
    pagination: {
      filters: {
        advancedFilters?: {
          group1?: {
            search: string;
            sort?: string;
            order: 'asc' | 'desc';
          };
          group2: {
            userName?: string;
            sort?: string;
            order?: 'asc' | 'desc';
          };
        };
      };
    };
  };

  type AccessedProperty = AccessTypeObjectPropertyByDottedPath<
    State,
    DottedPathPathToTuple<'NotFound'>
  >;

  type ExpectErrorTypeNotFound = Expect<
    Equal<AccessedProperty, 'ErrorTypeNotFound'>
  >;

  type AccessedProperty2 = AccessTypeObjectPropertyByDottedPath<
    State,
    DottedPathPathToTuple<'pagination.filters.advancedFilters.notExist'>
  >;

  type ExpectErrorTypeNotFound2 = Expect<
    Equal<AccessedProperty2, 'ErrorTypeNotFound'>
  >;
});

it('Should return User | undefined ', () => {
  type User = {
    id: string;
    name: string;
  };

  type State = {
    pagination: {
      filters: {
        advancedFilters?: {
          group1?: {
            search: string;
            sort?: string;
            order: 'asc' | 'desc';
          };
          group2: {
            userName?: string;
            sort?: string;
            order?: 'asc' | 'desc';
          };
        };
      };
    };
    user: User | undefined;
    selection?: {
      user: User | undefined;
    };
  };

  type AccessedProperty = AccessTypeObjectPropertyByDottedPath<
    State,
    DottedPathPathToTuple<'user'>
  >;

  type ExpectUserOrUndefined = Expect<
    Equal<AccessedProperty, User | undefined>
  >;

  type AccessedProperty2 = AccessTypeObjectPropertyByDottedPath<
    State,
    DottedPathPathToTuple<'selection.user'>
  >;

  type ExpectUserOrUndefined2 = Expect<
    Equal<AccessedProperty2, User | undefined>
  >;
});
