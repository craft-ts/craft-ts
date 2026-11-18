import { afterEach, expect, expectTypeOf, it } from 'vitest';
import {
  craftExpose,
  craftService,
  craftUse,
  CraftTestBed,
  toYieldable,
  type CraftServiceInput,
} from '../index';

afterEach(() => CraftTestBed.resetTestingModule());

it('forwards shortcut arguments when only $provided inputs are declared (#25)', () => {
  const { Echo, provideEcho } = craftService(
    { name: 'Echo', providedIn: 'toProvide' },
    function* (inputs: {
      readonly $provided: { readonly prefix: CraftServiceInput<string> };
    }) {
      const prefix = yield* inputs.$provided.prefix();
      yield* craftExpose('echo', (text: string) => `${prefix}${String(text)}`);
      yield* craftExpose('nested', {
        echo: (value: { text: string }) => `${prefix}${value.text}`,
      });
    },
  );
  CraftTestBed.configureTestingModule({
    providers: [provideEcho({ prefix: toYieldable(() => '>') })],
  });
  expect(
    CraftTestBed.runInInjectionContext(() => craftUse(Echo.echo('hi'))),
  ).toBe('>hi');
  expect(
    CraftTestBed.runInInjectionContext(() =>
      craftUse(Echo.nested.echo({ text: 'object' })),
    ),
  ).toBe('>object');
});

it('preserves a generator function returned by a shortcut method (#29)', () => {
  const { Texts, provideTexts } = craftService(
    { name: 'Texts', providedIn: 'toProvide' },
    function* () {
      const reader = (key: string) => function* () { return `text:${key}`; };
      yield* craftExpose('reader', reader);
      yield* craftExpose('nested', { reader });
    },
  );
  CraftTestBed.configureTestingModule({ providers: [provideTexts()] });
  CraftTestBed.runInInjectionContext(() => {
    const reader = craftUse(Texts.reader('greeting'));
    expectTypeOf(reader).toEqualTypeOf<() => Generator<never, string, unknown>>();
    expect(typeof reader).toBe('function');
    expect(craftUse(reader())).toBe('text:greeting');
    const nested = craftUse(Texts.nested.reader('nested'));
    expect(craftUse(nested())).toBe('text:nested');
  });
});
