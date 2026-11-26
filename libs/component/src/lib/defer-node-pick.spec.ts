// @vitest-environment jsdom
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ComponentDepsOf, RouteCheckedDI } from '@craft-ts/core';
import { craftComponent, deferNode, div, p } from '../index';
import { provideDeferPickCounter } from './defer-node-pick.fixture.test';
import { renderCraftComponent } from './testing';

// `deferNode(loader).pick(name, options)`: the loader returns the module and
// the component export is named apart. Selecting it inside the loader
// (`.then((module) => module.X)`) used to lose the component's type when the
// `deferNode` was written in a template, and its services vanished from the
// parent's DI proof.

const Parent = craftComponent('DeferPickParent', {}, () =>
  div([
    deferNode(({ withRetry }) =>
      withRetry(import('./defer-node-pick.fixture.test')),
    ).pick('DeferPickPanel', {
      trigger: 'interaction',
      placeholder: () => p('Load'),
    }),
  ]),
);

const ProvidingParent = craftComponent(
  'DeferPickProvidingParent',
  { providers: [provideDeferPickCounter()] },
  function* () {
    return div([
      deferNode(({ withRetry }) =>
        withRetry(import('./defer-node-pick.fixture.test')),
      ).pick('DeferPickPanel', { trigger: 'immediate' }),
    ]);
  },
);

describe('deferNode(loader).pick(name, options)', () => {
  it("carries the picked component's contract into an inline template", () => {
    expectTypeOf<
      keyof ComponentDepsOf<typeof Parent>['missingProvider']
    >().toEqualTypeOf<'DeferPickCounter'>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof Parent>, 'Other'>
    >().toEqualTypeOf<
      ['The DeferPickCounter service is not provided in this component']
    >();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof ProvidingParent>, 'Other'>
    >().toEqualTypeOf<true>();
  });

  it('refuses an export that is not a component, and props that do not match', () => {
    const picker = deferNode(({ withRetry }) =>
      withRetry(import('./defer-node-pick.fixture.test')),
    );
    // This branch exists only to assert the type errors.
    if (false) {
      // @ts-expect-error no such export.
      picker.pick('DeferPickPanell');
      // @ts-expect-error the export is not a component.
      picker.pick('deferPickNotAComponent');
      // @ts-expect-error the component has a required input.
      picker.pick('DeferPickTitled');
      // @ts-expect-error the component has a required input.
      picker.pick('DeferPickTitled', { trigger: 'idle' });
      // @ts-expect-error the input has the wrong type.
      picker.pick('DeferPickTitled', { props: { title: 1 } });
      craftComponent('DeferPickUnpicked', {}, () =>
        // @ts-expect-error a module loader renders nothing until it picks.
        div([picker]),
      );
    }
  });

  it('renders the picked export once loaded', async () => {
    const { nativeElement: element, destroy } =
      await renderCraftComponent(ProvidingParent);
    await vi.waitFor(() => {
      expect(element.querySelector('.picked-panel')?.textContent).toBe(
        'counted',
      );
    });
    destroy();
  });

  it('fails the load when the module has no such component export', async () => {
    const Broken = craftComponent('DeferPickBroken', {}, () =>
      div([
        (
          deferNode(({ withRetry }) =>
            withRetry(import('./defer-node-pick.fixture.test')),
          ) as unknown as {
            pick: (name: string, options: object) => never;
          }
        ).pick('Missing', {
          trigger: 'immediate',
          error: () => p({ class: 'picked-error' }, 'failed'),
        }),
      ]),
    );
    const { nativeElement: element, destroy } =
      await renderCraftComponent(Broken);
    await vi.waitFor(() => {
      expect(element.querySelector('.picked-error')?.textContent).toBe(
        'failed',
      );
    });
    destroy();
  });
});
