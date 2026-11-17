import { bootstrapCraft, provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { fixture } from './fixture';
declare const __MODE__: string;
const params = new URLSearchParams(location.search);
const sample = fixture(
  Number(params.get('rows') ?? 1000),
  __MODE__,
  params.get('buttons') === 'true',
  params.get('counts') === 'true',
);
const start = performance.now();
const app = bootstrapCraft({
  host: document.getElementById('mount')!,
  mode: 'production',
  config: craftAppConfig({
    providers: [provideCraftRootComponent(sample.App)],
  }),
});
const mount = performance.now() - start;
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));
await settle();
const layoutStart = performance.now();
document.getElementById('mount')!.getBoundingClientRect();
const layout = performance.now() - layoutStart;
const bench = {
  mount,
  layout,
  ready: false,
  frame: 0,
  lifecycle: sample.lifecycle,
  async run(name: string) {
    const started = performance.now();
    if (name === 'destroy') app.destroy();
    else sample.action(name);
    await settle();
    return performance.now() - started;
  },
};
(globalThis as any).__imperativeBench = bench;
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    bench.frame = performance.now() - start;
    bench.ready = true;
  }),
);
