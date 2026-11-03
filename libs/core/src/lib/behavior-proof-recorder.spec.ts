import { vi } from 'vitest';
import { craftException } from './craft-exception';
import { craftMethod } from './craft-method';
import { craftService } from './craft-service';
import { query } from './query';
import {
  ɵbehaviorTarget,
  ɵprovideBehaviorProofRecording,
  ɵrecordServerFunctionProof,
  ɵstartBehaviorProofRecording,
  ɵstopBehaviorProofRecording,
} from './behavior-proof-recorder';
import { ɵinjectCraftRouteActivationTracker } from './craft-route-activation';
import { ɵregisterCraftTestProviders } from './craft-test-providers';
import { CraftTestBed } from './host/craft-test-bed';
import { setupCraftServiceTest } from './setup-craft-service-test';

const { Basket } = craftService(
  { name: 'basket', providedIn: 'toProvide' },
  function* () {
    yield* craftMethod('add', function* (id: string) {
      return id;
    });
    yield* craftMethod('reserve', function* () {
      return craftException({ _tag: 'OutOfStock' });
    });
    yield* craftMethod('crash', function* () {
      throw new RangeError('boom');
    });
  },
);

const loadedProducts: string[] = [];
const { Catalog } = craftService(
  { name: 'catalog', providedIn: 'toProvide' },
  function* () {
    yield* query(
      'products',
      {
        method: (term: string) => term,
        loader: async ({ params }) => {
          loadedProducts.push(params);
          return [params];
        },
      },
      ({ resource }) => ({ hasProducts: () => resource.hasValue() }),
    );
  },
);

describe('behaviour proof recording', () => {
  let unregister: () => void;
  beforeEach(() => {
    unregister = ɵregisterCraftTestProviders([ɵprovideBehaviorProofRecording()]);
  });
  afterEach(() => {
    ɵstopBehaviorProofRecording();
    unregister();
  });

  it('records each settled invocation once, by its address, never the host being built', () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Basket, {});
    sut.add('a');
    sut.add('b');

    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      {
        key: 'invocation:service:basket / method:add',
        kind: 'invocation',
        detail: { outcome: 'succeeded', behavior: 'basket.add' },
      },
    ]);
  });

  it('counts an exception value and a throw as failures', () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Basket, {});
    sut.reserve();
    expect(() => sut.crash()).toThrow('boom');

    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      {
        key: 'invocation:service:basket / method:reserve',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'OutOfStock', behavior: 'basket.reserve' },
      },
      {
        key: 'invocation:service:basket / method:crash',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'RangeError', behavior: 'basket.crash' },
      },
    ]);
  });

  it('tells the steps an assertion came after from those none did', () => {
    ɵstartBehaviorProofRecording({
      assertions: () => expect.getState().assertionCalls,
    });
    const { sut } = setupCraftServiceTest(Basket, {});
    expect(sut.add('a')).toBe('a');
    expect(sut.reserve()).toMatchObject({ _tag: 'OutOfStock' });
    // vitest counts an assertion at `expect(…)`, before its matcher runs:
    // a call made by the matcher itself has no assertion after it.
    expect(() => sut.crash()).toThrow('boom');

    const { steps, observedSteps } = ɵstopBehaviorProofRecording();
    expect(steps.map((step) => step.key)).toEqual([
      'invocation:service:basket / method:add',
      'invocation:service:basket / method:reserve',
      'invocation:service:basket / method:crash',
    ]);
    expect(observedSteps).toBe(2);
  });

  it('proves a query by its loader, never by the code that builds or feeds it', async () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Catalog, {});
    // Created, its insertions run: nothing a user triggered yet.
    expect(ɵstopBehaviorProofRecording().steps).toEqual([]);

    ɵstartBehaviorProofRecording();
    sut.products.call('tea');
    await vi.waitFor(() => expect(loadedProducts).toEqual(['tea']));
    await Promise.resolve();
    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      {
        key: 'invocation:service:catalog / query:products',
        kind: 'invocation',
        detail: { outcome: 'succeeded', behavior: 'catalog.products' },
      },
    ]);
  });

  it('records nothing outside a recording, nor once its providers are gone', () => {
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording().steps).toEqual([]);

    unregister();
    ɵstartBehaviorProofRecording();
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording().steps).toEqual([]);
  });

  it('records the routes the router activated, as a session trace keys them', () => {
    ɵstartBehaviorProofRecording();
    const tracker = CraftTestBed.runInInjectionContext(() =>
      ɵinjectCraftRouteActivationTracker(),
    );
    tracker.publish({ url: '/cart', routePath: 'cart', outcome: 'activated' });
    tracker.publish({ url: '/x', routePath: 'admin#2', outcome: 'failed' });
    // A lazy child at '' is told from its siblings by its collection.
    tracker.publish({ url: '/coverage', routePath: '', routeCollection: 'coverage', outcome: 'activated' });
    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      { key: 'route-activation:cart', kind: 'route', detail: { outcome: 'activated' } },
      { key: 'route-activation:admin', kind: 'route', detail: { outcome: 'failed' } },
      {
        key: 'route-activation:',
        kind: 'route',
        detail: { outcome: 'activated', behavior: 'coverage:' },
      },
    ]);
  });

  it('records a server function that answered, and one that failed as a value', () => {
    ɵstartBehaviorProofRecording();
    ɵrecordServerFunctionProof('users.list', [{ id: 1 }]);
    ɵrecordServerFunctionProof('users.get', craftException({ _tag: 'NotFound' }));
    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      { key: 'server-fn:users.list', kind: 'http', detail: { outcome: 'ok' } },
      { key: 'server-fn:users.get', kind: 'http', detail: { outcome: 'error' } },
    ]);
  });

  it('names what an invocation runs the way the catalog does', () => {
    expect(ɵbehaviorTarget(['service:cart#2', 'mutation:addLine'])).toBe('cart.addLine');
    expect(
      ɵbehaviorTarget(['route:shop', 'component:CartPage#1', 'method:checkout']),
    ).toBe('CartPage.checkout');
    expect(ɵbehaviorTarget(['service:cart'])).toBeUndefined();
    expect(ɵbehaviorTarget(['method:orphan'])).toBeUndefined();
  });
});
