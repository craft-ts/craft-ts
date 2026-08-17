import type { SignalSource, YieldableReactiveValue } from '@craft-ng/core';
import { expect, it } from 'vitest';

type _Assert = YieldableReactiveValue<number, 'n'>;
type AssertAssignable<Expected, Actual extends Expected> = Actual;
type _SignalSourceStaysYieldable = AssertAssignable<
  YieldableReactiveValue<number | undefined, string>,
  SignalSource<number>
>;
// Craft owns these four outright now — they name generic concepts an app
// authors against (a value that changes, a teardown hook, a way to register
// something, a handle to stop an effect), not Angular ones. The public index
// exports them on purpose; importing them here is the assertion.
import type {
  DestroyRef,
  EffectRef,
  Provider,
  Signal,
} from '@craft-ng/core';
type _CraftOwnedSurface = [Signal<number>, DestroyRef, Provider, EffectRef];

// @ts-expect-error Angular Injector must not leak from the public index
import type { Injector } from '@craft-ng/core';
// @ts-expect-error Angular Type must not leak from the public index
import type { Type } from '@craft-ng/core';
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
