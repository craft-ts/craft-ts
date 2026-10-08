import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  abstract,
  craftComputed,
  craftException,
  craftExpose,
  craftService,
  craftSignal,
  type ComponentDepsOf,
  type CraftServiceInput,
} from '@craft-ts/core';
import {
  catchNode,
  craftComponent,
  p,
  withComponentProviders,
  withProviders,
  type ComponentInitializationExceptionsOf,
  type Input,
} from '../index';
import { renderCraftComponent } from './testing';

describe('withComponentProviders', () => {
  it('infers inputs and preserves per-instance services across input and host updates', async () => {
    let factoryCalls = 0;
    let serviceCalls = 0;
    const instances: object[] = [];
    const { ProfileContext, provideProfileContext } = craftService(
      { name: 'ProfileContext', providedIn: 'toProvide' },
      function* (inputs: {
        $provided: { profileId: CraftServiceInput<string> };
      }) {
        serviceCalls += 1;
        yield* craftComputed('label', function* () {
          return yield* inputs.$provided.profileId();
        });
      },
    );
    const Profile = craftComponent(
      'Profile',
      {},
      function* (inputs: { profileId: Input<string> }) {
        const service = yield* ProfileContext();
        instances.push(service);
        return p({ title: inputs.profileId }, service.label);
      },
    ).pipe(
      withComponentProviders(({ profileId }) => {
        expectTypeOf(profileId).toEqualTypeOf<Input<string>>();
        factoryCalls += 1;
        return [provideProfileContext({ profileId })];
      }),
    );

    expect(factoryCalls).toBe(0);
    const id = craftSignal('first');
    const first = await renderCraftComponent(Profile, {
      props: {
        profileId: function* () {
          return id();
        },
      },
    });
    const second = await renderCraftComponent(Profile, {
      props: {
        profileId: function* () {
          return 'second';
        },
      },
    });
    expect(first.element.textContent).toBe('first');
    expect(second.element.textContent).toBe('second');
    const [firstInstance, secondInstance] = instances;
    expect(firstInstance).not.toBe(secondInstance);

    id.set('reactive');
    await first.flush();
    expect(first.element.textContent).toBe('reactive');
    expect(second.element.textContent).toBe('second');

    const patchedProps = {
      profileId: function* () {
        return 'patched';
      },
      title: 'host updated',
    };
    first.mounted.updateProps(patchedProps);
    await first.flush();
    expect(first.element.textContent).toBe('patched');
    expect(first.element.querySelector('p')?.getAttribute('title')).toBe(
      'host updated',
    );
    expect(instances.at(-1)).toBe(firstInstance);
    const hostOnlyProps = { ...patchedProps, title: 'host only' };
    first.mounted.updateProps(hostOnlyProps);
    await first.flush();
    expect(first.element.querySelector('p')?.getAttribute('title')).toBe(
      'host only',
    );
    expect(factoryCalls).toBe(2);
    expect(serviceCalls).toBe(2);
    first.destroy();
    second.destroy();
  });

  it('shares the cached provider instance with sibling services', async () => {
    let serviceCalls = 0;
    const { Shared, provideShared } = craftService(
      { name: 'Shared', providedIn: 'toProvide' },
      function* (inputs: {
        $provided: { profileId: CraftServiceInput<string> };
      }) {
        serviceCalls += 1;
        yield* craftComputed('label', function* () {
          return yield* inputs.$provided.profileId();
        });
      },
    );
    const { Consumer, provideConsumer } = craftService(
      { name: 'Consumer', providedIn: 'toProvide' },
      function* () {
        yield* Shared();
      },
    );
    const SharedProfile = craftComponent(
      'SharedProfile',
      {},
      function* (_inputs: { profileId: Input<string> }) {
        const shared = yield* Shared();
        const consumer = yield* Consumer();
        expect(consumer.shared).toBe(shared);
        return p(shared.label);
      },
    ).pipe(
      withComponentProviders(({ profileId }) => [
        provideConsumer(),
        provideShared({ profileId }),
      ]),
    );

    const rendered = await renderCraftComponent(SharedProfile, {
      props: {
        profileId: function* () {
          return 'shared';
        },
      },
    });
    expect(rendered.element.textContent).toBe('shared');
    expect(serviceCalls).toBe(1);
    rendered.destroy();
  });

  it('keeps the declared order across successive static and input-bound operators', async () => {
    const { Label, provideLabel } = craftService(
      { name: 'Label', providedIn: 'abstract' },
      abstract<string>(),
    );
    const Base = craftComponent('ProviderOrder', {}, () => p(Label));
    const First = Base.pipe(
      withComponentProviders(() => [provideLabel(() => 'first')]),
    ).pipe(withProviders([provideLabel(() => 'last')]));
    const Second = Base.pipe(withProviders([provideLabel(() => 'first')])).pipe(
      withComponentProviders(() => [provideLabel(() => 'last')]),
    );
    for (const component of [First, Second]) {
      const rendered = await renderCraftComponent(component);
      expect(rendered.element.textContent).toBe('last');
      rendered.destroy();
    }
  });

  it('propagates provider exceptions and handles them at the component boundary', async () => {
    const denied = craftException({ _tag: 'PROFILE_DENIED' });
    const { provideAccess } = craftService(
      { name: 'Access', providedIn: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const Profile = craftComponent('DeniedProfile', {}, () =>
      p('profile'),
    ).pipe(withComponentProviders(() => [provideAccess(() => denied)]));
    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof Profile>
    >().toEqualTypeOf<'PROFILE_DENIED'>();
    const Caught = Profile.pipe(
      catchNode.exhaustive({ PROFILE_DENIED: () => p('denied') }),
    );
    const rendered = await renderCraftComponent(Caught);
    expect(rendered.element.textContent).toBe('denied');
    rendered.destroy();
  });

  it('checks input names, binding types, and provider dependency contracts', () => {
    const { Dependency, provideDependency } = craftService(
      { name: 'Dependency', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('value', 'dependency');
      },
    );
    const { Bound, provideBound } = craftService(
      { name: 'Bound', providedIn: 'toProvide' },
      function* (inputs: { $provided: { id: CraftServiceInput<string> } }) {
        yield* Dependency();
        yield* craftExpose('id', inputs.$provided.id);
      },
    );
    const Base = craftComponent(
      'TypedProfile',
      {},
      (inputs: { id: Input<string> }) => p(inputs.id),
    );
    const _Profile = Base.pipe(
      withComponentProviders(({ id }) => [provideBound({ id })]),
    );
    type Dependencies = ComponentDepsOf<typeof _Profile>;
    expectTypeOf<keyof Dependencies['provided']>().toEqualTypeOf<'Bound'>();
    expectTypeOf<
      keyof Dependencies['missingProvider']
    >().toEqualTypeOf<'Dependency'>();

    const Consumed = craftComponent(
      'ConsumedProfile',
      {},
      function* (_inputs: { id: Input<string> }) {
        const service = yield* Bound();
        return p(service.id);
      },
    ).pipe(withComponentProviders(({ id }) => [provideBound({ id })]));
    expectTypeOf<
      keyof ComponentDepsOf<typeof Consumed>['missingProvider']
    >().toEqualTypeOf<'Dependency'>();
    const _Complete = Consumed.pipe(
      withComponentProviders(({ id }) => [
        provideDependency(),
        provideBound({ id }),
      ]),
    ).pipe(withProviders([]));
    expectTypeOf<
      keyof ComponentDepsOf<typeof _Complete>['provided']
    >().toEqualTypeOf<'Bound' | 'Dependency'>();
    expectTypeOf<
      keyof ComponentDepsOf<typeof _Complete>['missingProvider']
    >().toEqualTypeOf<never>();

    Base.pipe(
      withComponentProviders(
        ({
          // @ts-expect-error — only template inputs are available.
          missing,
        }) => [provideBound({ id: missing })],
      ),
    );
    const Numeric = craftComponent(
      'NumericProfile',
      {},
      (inputs: { id: Input<number> }) => p(inputs.id),
    );
    Numeric.pipe(
      withComponentProviders(({ id }) => [
        // @ts-expect-error — a number reader cannot configure a string reader.
        provideBound({ id }),
      ]),
    );
  });
});
