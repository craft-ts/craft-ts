import {
  paginationQueryParams,
  positiveIntegerQueryParam,
} from './query-params.utils';

describe('query params utilities', () => {
  it('decodes and encodes positive safe integers', () => {
    const config = positiveIntegerQueryParam(1);

    expect(config.codec.decode('12')).toBe(12);
    expect(config.codec.encode(12)).toBe('12');
  });

  it.each(['', '0', '-1', '1.5', 'not-a-number'])(
    'rejects invalid positive integers: %s',
    (value) => {
      const config = positiveIntegerQueryParam(1);

      expect(() => config.codec.decode(value)).toThrow();
    },
  );

  it('rejects invalid encoded values', () => {
    const config = positiveIntegerQueryParam(1);

    expect(() => config.codec.encode(0)).toThrow();
    expect(() => config.codec.encode(Number.NaN)).toThrow();
  });

  it('provides the shared pagination defaults', () => {
    const config = paginationQueryParams();

    expect(config.state.page.fallbackValue).toBe(1);
    expect(config.state.pageSize.fallbackValue).toBe(4);
  });
});
