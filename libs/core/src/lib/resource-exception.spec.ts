import {
  signal,
} from './host/craft-compat';
import { describe, expect, it } from 'vitest';
import { craftException, type AnyCraftException } from './craft-exception';
import {
  createResourceExceptionsRuntime,
  enrichResourceException,
  removeResourceExceptionById,
} from './resource-exception';

const ex = (code: string) => craftException({ code });

describe('enrichResourceException', () => {
  it('sets scope and mirrors the payload under the exception code key', () => {
    const exception = craftException({ code: 'notFound' }, { id: 1 });
    const enriched = enrichResourceException(exception, { scope: 'loader' });
    expect(enriched.scope).toBe('loader');
    expect((enriched as Record<string, unknown>)['notFound']).toEqual({
      id: 1,
    });
  });

  it('sets identifier when provided', () => {
    const enriched = enrichResourceException(ex('failed'), {
      scope: 'loader',
      identifier: 'row-1',
    });
    expect(enriched.identifier).toBe('row-1');
  });

  it('deletes identifier when not provided', () => {
    const exception = enrichResourceException(ex('failed'), {
      scope: 'loader',
      identifier: 'row-1',
    });
    const reEnriched = enrichResourceException(exception, {
      scope: 'params',
    });
    expect('identifier' in reEnriched).toBe(false);
  });

  it('does not mutate the original exception', () => {
    const original = ex('boom');
    const enriched = enrichResourceException(original, { scope: 'params' });
    expect(enriched).not.toBe(original);
    expect(original.scope).toBeUndefined();
    expect(enriched.scope).toBe('params');
  });
});

describe('removeResourceExceptionById', () => {
  it('removes the entry for the given id', () => {
    const state = { a: ex('a-error'), b: ex('b-error') };
    const next = removeResourceExceptionById(state, 'a');
    expect(next).toEqual({ b: state.b });
  });

  it('returns the same reference when the id is absent', () => {
    const state = { a: ex('a-error') };
    const next = removeResourceExceptionById(state, 'missing');
    expect(next).toBe(state);
  });

  it('does not mutate the original state', () => {
    const state = { a: ex('a-error') };
    removeResourceExceptionById(state, 'a');
    expect(state).toHaveProperty('a');
  });
});

describe('createResourceExceptionsRuntime', () => {
  describe('without identifier', () => {
    function setup() {
      const paramsException = signal<AnyCraftException | undefined>(
        undefined,
      );
      const runtime = createResourceExceptionsRuntime({
        isUsingIdentifier: false,
        paramsException,
      });
      return { paramsException, ...runtime };
    }

    it('starts with no exceptions', () => {
      const { exceptions, hasException } = setup();
      expect(exceptions()).toEqual({ list: [], params: {}, loader: {} });
      expect(hasException()).toBe(false);
    });

    it('reflects the params exception', () => {
      const { paramsException, exceptions, hasException } = setup();
      const e = ex('paramsBad');
      paramsException.set(e);
      expect(hasException()).toBe(true);
      expect(exceptions()).toEqual({ list: [e], params: e, loader: {} });
    });

    it('setLoaderException sets and clears the single loader exception', () => {
      const { setLoaderException, exceptions, hasException } = setup();
      const e = ex('loaderBad');
      setLoaderException(e);
      expect(hasException()).toBe(true);
      expect(exceptions()).toEqual({ list: [e], params: {}, loader: e });

      setLoaderException(undefined);
      expect(hasException()).toBe(false);
      expect(exceptions()).toEqual({ list: [], params: {}, loader: {} });
    });

    it('combines params and loader exceptions in the list', () => {
      const { paramsException, setLoaderException, exceptions } = setup();
      const p = ex('paramsBad');
      const l = ex('loaderBad');
      paramsException.set(p);
      setLoaderException(l);
      expect(exceptions().list).toEqual([p, l]);
    });
  });

  describe('with identifier', () => {
    function setup() {
      const paramsException = signal<AnyCraftException | undefined>(
        undefined,
      );
      const runtime = createResourceExceptionsRuntime({
        isUsingIdentifier: true,
        paramsException,
      });
      return { paramsException, ...runtime };
    }

    it('ignores setLoaderException calls without an id', () => {
      const { setLoaderException, exceptions, hasException } = setup();
      setLoaderException(ex('noId'));
      expect(hasException()).toBe(false);
      expect(exceptions()).toEqual({ list: [], params: {}, loader: {} });
    });

    it('sets and removes loader exceptions keyed by id', () => {
      const { setLoaderException, exceptions, hasException } = setup();
      const e1 = ex('row1Bad');
      const e2 = ex('row2Bad');
      setLoaderException(e1, 'row-1');
      setLoaderException(e2, 'row-2');

      expect(hasException()).toBe(true);
      expect(exceptions()).toEqual({
        list: [e1, e2],
        params: {},
        loader: { 'row-1': e1, 'row-2': e2 },
      });

      setLoaderException(undefined, 'row-1');
      expect(exceptions()).toEqual({
        list: [e2],
        params: {},
        loader: { 'row-2': e2 },
      });
    });

    it('createSelectExceptions scopes to a single id', () => {
      const { setLoaderException, createSelectExceptions } = setup();
      const e1 = ex('row1Bad');
      const e2 = ex('row2Bad');
      setLoaderException(e1, 'row-1');
      setLoaderException(e2, 'row-2');

      const row1 = createSelectExceptions('row-1');
      expect(row1()).toEqual({ list: [e1], params: {}, loader: e1 });
    });

    it('createSelectHasException scopes to a single id', () => {
      const { setLoaderException, createSelectHasException } = setup();
      const hasRow1 = createSelectHasException('row-1');
      expect(hasRow1()).toBe(false);

      setLoaderException(ex('row1Bad'), 'row-1');
      expect(hasRow1()).toBe(true);
    });

    it('createSelectHasException also reacts to params exceptions', () => {
      const { paramsException, createSelectHasException } = setup();
      const hasRow1 = createSelectHasException('row-1');
      paramsException.set(ex('paramsBad'));
      expect(hasRow1()).toBe(true);
    });
  });
});
