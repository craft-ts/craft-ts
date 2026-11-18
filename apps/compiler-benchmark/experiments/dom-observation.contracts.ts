// @vitest-environment jsdom
import { it, expect, afterAll } from 'vitest';
import { writeFile } from 'node:fs/promises';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  provideCraftProduction,
  provideCraftDevelopment,
} from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
} from '../../component/src/lib/host-runtime';
import { mountInterpretedComponent } from '../../component/src/lib/render/interpreter';
import { compileModule } from './compiler';
const observations: unknown[] = [];
let serial = 0;
afterAll(async () => {
  if (process.env.CAMPAIGN_OBSERVATION_OUTPUT)
    await writeFile(
      process.env.CAMPAIGN_OBSERVATION_OUTPUT,
      JSON.stringify(observations, null, 2) + '\n',
    );
});
it.each([
  { lean: false, nested: false },
  { lean: true, nested: false },
  { lean: false, nested: true },
  { lean: true, nested: true },
])(
  'records connected DOM observation without assuming callback purity: %j',
  (options) => {
    const marker = 'observe-' + serial++;
    const observe = () =>
      document.querySelectorAll(`[data-marker="${marker}"]`).length;
    const body = `[div({'data-marker':'${marker}'},'first'),span(()=>observe())]`;
    const source = `import {craftComponent,div,span} from '@craft-ts/component';export const Row=craftComponent('Observed${serial}',{},()=>${options.nested ? 'div(' + body + ')' : body});export const App=craftComponent('ObservationOwner${serial}',{},()=>Row({}));`;
    const result = compileModule(source, 'observation.ts', {
      lean: options.lean,
    });
    const exports: any = {},
      js = ts.transpileModule(result.code, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
    new Function('require', 'exports', 'observe', js)(
      (name: string) => (name.endsWith('/compiler-runtime') ? runtime : api),
      exports,
      observe,
    );
    const values = [];
    for (const development of [false, true]) {
      const injector = createEnvironmentInjector(
        [development ? provideCraftDevelopment() : provideCraftProduction()],
        Injector.NULL as EnvironmentInjector,
        'observation',
      );
      const host = document.createElement('div');
      document.body.append(host);
      const view = mountInterpretedComponent(exports.App, host, injector, {});
      try {
        values.push(host.querySelector('span')?.textContent);
      } finally {
        view.destroy();
        injector.destroy();
        host.remove();
      }
    }
    const compiled = result.components[0].status === 'compiled';
    observations.push({
      options,
      source,
      components: result.components,
      compiled,
      generic: values[1],
      production: values[0],
    });
    expect(values[1]).toBe('1');
    expect(values[0]).toBe(compiled ? '0' : '1');
  },
);
