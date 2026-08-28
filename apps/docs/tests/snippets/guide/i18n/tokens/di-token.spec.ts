// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region di-token
import { craftService, state } from '@craft-ts/core';
import { button, craftComponent, div, p } from '@craft-ts/component';
import {
  createI18nRuntime,
  defineCatalog,
  defineLocale,
  defineToken,
  msg,
} from '@craft-ts/i18n';

type UnitSystem = 'metric' | 'imperial';

const { Units } = craftService(
  { name: 'Units', providedIn: 'global' },
  function* () {
    const system = yield* state('system', 'metric' as UnitSystem, ({ set }) => ({
      useImperial: () => set('imperial'),
    }));
    return { system };
  },
);

// No `format`: the unit does not exist until the service has answered, so the
// token declares a resolver instead of a standalone formatter.
const weight = defineToken({
  name: 'weight',
  kind: 'weight',
  resolveFormatter: function* () {
    const units = yield* Units();
    const unit = (yield* units.system()) === 'imperial' ? 'pound' : 'kilogram';
    return (value: number, context) =>
      new Intl.NumberFormat(context.locale, { style: 'unit', unit }).format(
        unit === 'pound' ? value * 2.20462 : value,
      );
  },
});

const en = defineLocale(
  'en-US',
  defineCatalog({ order: { line: msg`Shipping ${weight}.` } }),
);
const runtime = createI18nRuntime({ locales: [en] });

const ShippingLine = craftComponent(
  'ShippingLine',
  {},
  function* () {
    const units = yield* Units();
    // The translator re-reads whenever the unit system does.
    return { translate: runtime.bind(units.system), units };
  },
  ({ translate, units }) =>
    div([
      p(translate('order.line', { weight: 12 })),
      button(
        'imperial',
        { type: 'button', click: units.system.useImperial },
        'Imperial',
      ),
    ]),
);
// #endregion di-token

describe('guide/i18n/tokens.md #di-token', () => {
  it('formats through the unit system resolved from the injector', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(
      ShippingLine,
      host,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(host.textContent).toContain('kg');

    host.querySelector<HTMLButtonElement>('button')?.click();
    TestBed.tick();
    expect(host.textContent).toContain('lb');

    mounted.destroy();
  });
});
