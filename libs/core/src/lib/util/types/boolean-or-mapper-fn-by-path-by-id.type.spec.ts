import { ResourceRef } from '@angular/core';
import { Expect, Equal } from 'test-type';
import { BooleanOrMapperFnByPathById } from './boolean-or-mapper-fn-by-path-by-id.type';
import { ResourceByIdRef } from '../../resource-by-id';

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

  type QueryIdentifier = string;
  type ResourceParams = Params;

  type AllStatePathResult = BooleanOrMapperFnByPathById<
    State,
    ResourceState,
    Params,
    QueryIdentifier
  >;

  type Target = {
    pagination: (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
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
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
    }) => number;
    'pagination.pageSize': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
    }) => number;
    'pagination.filters':
      | boolean
      | ((data: {
          queryResource: ResourceRef<ResourceState>;
          queryParams: ResourceParams;
          queryIdentifier: string;
          queryResources: ResourceByIdRef<
            QueryIdentifier,
            ResourceState,
            ResourceParams
          >;
        }) => {
          search?: string;
          sort: string;
          order: 'asc' | 'desc';
        });
    'pagination.filters.search': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
    }) => string;
    'pagination.filters.sort': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
    }) => string;
    'pagination.filters.order': (data: {
      queryResource: ResourceRef<ResourceState>;
      queryParams: ResourceParams;
      queryIdentifier: string;
      queryResources: ResourceByIdRef<
        QueryIdentifier,
        ResourceState,
        ResourceParams
      >;
    }) => 'asc' | 'desc';
  };
  type ExpectARecordOfPathWithAssociatedType = Expect<
    Equal<Target, AllStatePathResult>
  >;

  const filtersCanBeBoolean: AllStatePathResult['pagination.filters'] = true;

  //@ts-expect-error it should not accept boolean for non-boolean paths
  const paginationCanNotBeBoolean: AllStatePathResult['pagination.page'] = true;
});
