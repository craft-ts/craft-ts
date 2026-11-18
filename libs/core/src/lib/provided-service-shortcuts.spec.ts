import { afterEach, expect, it } from 'vitest';
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
