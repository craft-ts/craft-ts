import type { QueryParamsConfig } from '@craft-ng/core';

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const decodePositiveInteger = (value: string): number => {
  if (typeof value !== 'string') {
    throw new Error(
      `Expected a string query param, received: ${String(value)}`,
    );
  }

  const decoded = Number(value);

  if (!isPositiveSafeInteger(decoded)) {
    throw new Error(
      `Expected a positive integer query param, received: ${value}`,
    );
  }

  return decoded;
};

const encodePositiveInteger = (value: number): string => {
  if (!isPositiveSafeInteger(value)) {
    throw new Error(
      `Expected a positive integer query param, received: ${value}`,
    );
  }

  return String(value);
};

export function positiveIntegerQueryParam(
  fallbackValue: number,
): QueryParamsConfig<number, string> {
  if (!isPositiveSafeInteger(fallbackValue)) {
    throw new Error(
      `Expected a positive integer query param fallback, received: ${fallbackValue}`,
    );
  }

  return {
    fallbackValue,
    codec: {
      decode: decodePositiveInteger,
      encode: encodePositiveInteger,
    },
  };
}

export function paginationQueryParams() {
  return {
    state: {
      page: positiveIntegerQueryParam(1),
      pageSize: positiveIntegerQueryParam(4),
    },
  };
}
