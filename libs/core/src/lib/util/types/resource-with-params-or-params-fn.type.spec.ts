import { ResourceWithParamsOrParamsFn } from './resource-with-params-or-params-fn.type';
import { Expect, Equal } from 'test-type';
import { ResourceStreamItem, signal } from '@angular/core';
import { Prettify } from '../util.type';

function test<ResourceState, Params, ParamsArgs>(
  data: ResourceWithParamsOrParamsFn<ResourceState, Params, ParamsArgs>
) {
  return data;
}

type InferParamsType<T> = T extends ResourceWithParamsOrParamsFn<
  any,
  infer Params,
  any
>
  ? Params
  : never;

type InferParamsArgType<T> = T extends ResourceWithParamsOrParamsFn<
  any,
  any,
  infer ParamsArgs
>
  ? ParamsArgs
  : never;

type InferStateType<T> = T extends ResourceWithParamsOrParamsFn<
  infer ResourceState,
  any,
  infer ParamsArgs
>
  ? Prettify<ResourceState>
  : never;

it('Should accept params or paramsFn, but not both', () => {
  const paramsOnly = test({
    params: () => 'test' as const,
    loader: ({ params }) => {
      return Promise.resolve({
        id: params,
        name: 'John Doe',
        email: 'john.doe@example.com',
      });
    },
  });
  type ParamsOnlyTypeRetrieved = Expect<
    Equal<InferParamsType<typeof paramsOnly>, 'test'>
  >;

  const paramsWithLoader = test({
    params: () => 'test',
    loader: ({ params }) => {
      return Promise.resolve({
        id: params,
        name: 'John Doe',
        email: 'john.doe@example.com',
      });
    },
  });

  // todo find why this needs an union type
  type ResourceStateTypeRetrieved = Expect<
    Equal<
      InferStateType<typeof paramsWithLoader>,
      | {
          id: string;
          name: string;
          email: string;
        }
      | {
          id: string;
          name: string;
          email: string;
        }
    >
  >;

  const paramsFnOnly = test({
    method: (data: { id: string; name: string; email: string }) =>
      'John' as const,
    loader: ({ params }) => {
      return Promise.resolve({
        id: params,
        name: 'John Doe',
        email: 'john.doe@example.com',
      });
    },
  });
  type MethodOnlyTypeRetrieved = Expect<
    Equal<InferParamsType<typeof paramsFnOnly>, 'John'>
  >;

  type ParamsFnOnlyArgTypeRetrieved = Expect<
    Equal<
      Parameters<NonNullable<(typeof paramsFnOnly)['method']>>[0],
      { id: string; name: string; email: string }
    >
  >;

  function testArgs<ResourceState, Params, ParamsArgs>(
    data: ResourceWithParamsOrParamsFn<ResourceState, Params, ParamsArgs>
  ) {
    return data as ParamsArgs;
  }
  const argsReturned = testArgs({
    method: (data: { id: string; name: string; email: string }) => data,
    loader: ({ params }) => {
      return Promise.resolve({
        id: params.id,
        name: params.name,
        email: params.email,
      });
    },
  });
  type ParamsFnOnlyArgTypeRetrieved2 = Expect<
    Equal<typeof argsReturned, { id: string; name: string; email: string }>
  >;

  //@ts-expect-error do not use params and method in the same declaration
  const noBoth = test({
    params: () => 'test' as const,
    method: () => 'test' as const,
  });
});

it('Should accept steams with params', () => {
  const streamTest = test({
    params: () => 'test' as const,
    stream: async ({ params }) => {
      type StreamResponseTypeRetrieved = Expect<Equal<typeof params, 'test'>>;

      const testSignal = signal<ResourceStreamItem<number>>({ value: 5 });
      return testSignal;
    },
  });

  type StreamResponseTypeRetrieved = Expect<
    Equal<InferStateType<typeof streamTest>, number>
  >;
});

it('Should accept steams with method', () => {
  const streamTest = test({
    method: (data: string) => 'test' as const,
    stream: async ({ params }) => {
      type StreamResponseTypeRetrieved = Expect<Equal<typeof params, 'test'>>;

      const testSignal = signal<ResourceStreamItem<number>>({ value: 5 });
      return testSignal;
    },
  });

  type StreamResponseTypeRetrieved = Expect<
    Equal<InferStateType<typeof streamTest>, number>
  >;

  type args = InferParamsArgType<typeof streamTest>;
  // todo check why this is not working
  // type MethodTypeRetrieved = Expect<
  //   Equal<InferParamsArgType<typeof streamTest>, string>
  // >;
});
