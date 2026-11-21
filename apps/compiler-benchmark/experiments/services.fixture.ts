import {
  craftService,
  craftExpose,
  craftUse,
  ɵsignal,
  ɵInjector as Injector,
} from '@craft-ts/core';
import { SERVICE_YIELD_WRAPPER } from '@campaign/generator-runtime';
let creations = 0;
const { ServiceCampaign } = craftService(
  { name: 'ServiceCampaign', providedIn: 'global' },
  function* () {
    creations++;
    yield* craftExpose('counter', ɵsignal(42));
    yield* craftExpose('label', 'service');
  },
);
const wrapped = new URLSearchParams(location.search).get('wrapped') === 'true';
const owner = Injector.create({
  providers: wrapped
    ? [
        {
          provide: SERVICE_YIELD_WRAPPER,
          useValue: [
            function* (_context: any, next: any) {
              return yield* next();
            },
          ],
        },
      ]
    : [],
});
let retained: any[] = [];
const expected = owner.run(() => craftUse(ServiceCampaign()));
const bench = {
  ready: true,
  run(kind: string, count: number) {
    let checksum = 0;
    const start = performance.now();
    owner.run(() => {
      if (kind === 'request') {
        const requests = new Array(count);
        for (let i = 0; i < count; i++) {
          const request = ServiceCampaign().next().value;
          requests[i] = request;
          checksum += (request as any).name.length;
        }
        retained = requests;
      } else if (kind === 'resolve') {
        for (let i = 0; i < count; i++) {
          const value = craftUse(ServiceCampaign());
          if (value !== expected) throw Error('service identity changed');
          checksum += value.counter();
        }
      } else if (kind === 'shortcut') {
        for (let i = 0; i < count; i++)
          checksum += craftUse(ServiceCampaign.counter());
      } else throw Error(kind);
    });
    const ms = performance.now() - start;
    const expectedSum =
      count * (kind === 'request' ? 'ServiceCampaign'.length : 42);
    if (checksum !== expectedSum || creations !== 1)
      throw Error(
        'service result/lifetime changed: ' + checksum + '/' + creations,
      );
    return { ms, checksum, retained: retained.length };
  },
};
(window as any).__serviceCampaign = bench;
