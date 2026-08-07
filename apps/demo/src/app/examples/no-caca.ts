import { Signal } from '@angular/core';
import {
  CraftHttpClient,
  asyncProcess,
  craftEffect,
  craftGen,
  craftService,
  mutation,
  query,
  state,
} from '@craft-ng/core';

type DemoData = { id: string; label: string };

/**
 * Forbidden: effects should not fetch and copy server data into local state.
 * Use the declarative query example at the bottom of this file instead.
 */
export const { FetchInEffectService } = craftService(
  { name: 'FetchInEffectService', scope: 'function' },
  function* (inputs: { id: Signal<string | undefined> }) {
    const data = yield* state(
      'data',
      undefined as DemoData | undefined,
      ({ set }) => ({ setData: set }),
    );

    const effect = craftEffect('fetch-in-effect', function* () {
      const id = inputs.id();
      if (!id) {
        data.setData(undefined);
        return () => undefined;
      }

      // eslint-disable-next-line craft-ng/prefer-craft-http-transport
      void fetch(`/api/demo/${id}`)
        .then((response) => response.json() as Promise<DemoData>)
        .then((value) => data.setData(value));
      return () => undefined;
    });

    return { data, effect };
  },
);

/** Forbidden: imperative resource triggers are not effect dependencies. */
export const { ImperativeResourceInEffectService } = craftService(
  { name: 'ImperativeResourceInEffectService', scope: 'function' },
  function* (inputs: { id: Signal<string | undefined> }) {
    const save = yield* mutation('save', {
      method: (id: string) => id,
      loader: async ({ params }) => ({ id: params }),
    });
    const validate = yield* asyncProcess('validate', {
      method: (id: string) => id,
      loader: async ({ params }) => ({ id: params }),
    });

    const effect = craftEffect('imperative-resource-in-effect', function* () {
      const id = inputs.id();
      if (!id) return () => undefined;

      // eslint-disable-next-line craft-ng/no-imperative-craft-resource-trigger
      yield* save.mutate(id);
      // eslint-disable-next-line craft-ng/no-imperative-craft-resource-trigger
      yield* validate.method(id);
      return () => undefined;
    });

    return { effect };
  },
);

/** Forbidden: the direct query call remains in the effect dependency graph. */
export const { ImperativeQueryInEffectService } = craftService(
  { name: 'ImperativeQueryInEffectService', scope: 'function' },
  function* (inputs: { id: Signal<string | undefined> }) {
    const data = yield* query('data', {
      method: (id: string) => id,
      loader: async ({ params }) => ({ id: params, label: params }),
    });

    const effect = craftEffect('imperative-query-in-effect', function* () {
      const id = inputs.id();
      if (!id) return () => undefined;

      // eslint-disable-next-line craft-ng/no-imperative-craft-resource-trigger
      yield* data.call(id);
      return () => undefined;
    });

    return { data, effect };
  },
);

/** Forbidden: craftGen does not hide an imperative query from craftEffect. */
export const { IndirectImperativeQueryService } = craftService(
  { name: 'IndirectImperativeQueryService', scope: 'function' },
  function* (inputs: { id: Signal<string | undefined> }) {
    const data = yield* query('data', {
      method: (id: string) => id,
      loader: async ({ params }) => ({ id: params, label: params }),
    });

    const triggerQuery = craftGen(function* (id: string) {
      yield* data.call(id);
    });

    const effect = craftEffect('indirect-imperative-query', function* () {
      const id = inputs.id();
      if (!id) return () => undefined;

      // eslint-disable-next-line craft-ng/no-imperative-craft-resource-trigger
      yield* triggerQuery(id);
      return () => undefined;
    });

    return { effect };
  },
);

/** Valid: an input signal drives the query declaratively. */
export const { DeclarativeQueryService } = craftService(
  { name: 'DeclarativeQueryService', scope: 'function' },
  function* (inputs: { id: Signal<string | undefined> }) {
    const data = yield* query('data', {
      params: inputs.id,
      loader: function* ({ params }) {
        if (!params) return undefined;
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/demo/${params}`,
          success: response<DemoData>(),
        }));
      },
    });

    return { data };
  },
);
