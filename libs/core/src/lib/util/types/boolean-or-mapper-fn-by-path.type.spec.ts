import {
  ResourceRef,
} from '../../host/craft-compat';
import { Expect, Equal } from 'test-type';
import { BooleanOrMapperFnByPath } from './boolean-or-mapper-fn-by-path.type';

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

  type ResourceState = {
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
  };

  type Params = {
    search?: string;
  };

  type AllStatePathResult = BooleanOrMapperFnByPath<
    State,
    ResourceState,
    Params
  >;

  type Target = {
    pagination: (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => {
      page: number;
      pageSize: number;
      filters?: {
        search?: string;
        sort: string;
        order: 'asc' | 'desc';
      };
    };
    'pagination.page': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => number;
    'pagination.pageSize': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => number;
    'pagination.filters':
      | boolean
      | ((data: {
          queryResource: ResourceRef<ResourceState>;
          queryParams: Params;
        }) => {
          search?: string;
          sort: string;
          order: 'asc' | 'desc';
        });
    'pagination.filters.search': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => string;
    'pagination.filters.sort': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => string;
    'pagination.filters.order': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: Params;
    }) => 'asc' | 'desc';
  };
  type ExpectARecordOfPathWithAssociatedType = Expect<
    Equal<Target, AllStatePathResult>
  >;

  const filtersCanBeBoolean: AllStatePathResult['pagination.filters'] = true;

  //@ts-expect-error it should not accept boolean for non-boolean paths
  const paginationCanNotBeBoolean: AllStatePathResult['pagination.page'] = true;
});
