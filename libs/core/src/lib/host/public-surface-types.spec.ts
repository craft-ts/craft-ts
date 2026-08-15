import type { YieldableReactiveValue } from '@craft-ng/core';
import { expect, it } from 'vitest';

type _Assert = YieldableReactiveValue<number, 'n'>;
// @ts-expect-error Angular Signal must not leak from the public index
import type { Signal } from '@craft-ng/core';
// @ts-expect-error Angular Injector must not leak from the public index
import type { Injector } from '@craft-ng/core';
// @ts-expect-error Angular Provider must not leak from the public index
import type { Provider } from '@craft-ng/core';
// @ts-expect-error Angular Type must not leak from the public index
import type { Type } from '@craft-ng/core';
// @ts-expect-error Angular EffectRef must not leak from the public index
import type { EffectRef } from '@craft-ng/core';
// @ts-expect-error Angular HttpClient must not leak from the public index
import type { HttpClient } from '@craft-ng/core';
// @ts-expect-error Angular HttpParams must not leak from the public index
import type { HttpParams } from '@craft-ng/core';
// @ts-expect-error Angular ApplicationConfig must not leak from the public index
import type { ApplicationConfig } from '@craft-ng/core';
// @ts-expect-error The raw host signal marker is internal
import type { RAW_REACTIVE_VALUE } from '@craft-ng/core';

it('keeps Craft readers public without exporting Angular Signal', () => {
  expect(true).toBe(true);
});
