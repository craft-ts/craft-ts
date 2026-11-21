import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compileModule } from './compiler.js';
const header = `import {craftComponent, div, forNode} from '@craft-ts/component';\n`;
const row = `const Row=craftComponent('Row',{},(inputs:any)=>div(function*(){return (yield* inputs.row()).label;}));`;
const list = `forNode(rows,{track:r=>r.id},row=>Row({row}))`;
function compile(body: string) {
  return compileModule(header + body, '/app/local.ts', { lean: true });
}
describe('local list initialization and binding proof', () => {
  it('specializes local constants in repeated fixture calls', () => {
    const result = compile(
      `function fixture(){${row} return ${list};} fixture(); fixture();`,
    );
    expect(result.optimizedLists).toBe(1);
    expect(
      ts.transpileModule(result.code, { reportDiagnostics: true }).diagnostics,
    ).toEqual([]);
  });
  it('keeps same-named declarations independent by symbol', () => {
    expect(
      compile(
        `function a(){${row} return ${list};} function b(){${row} return ${list};}`,
      ).optimizedLists,
    ).toBe(2);
  });
  it('refuses parameter shadowing and mutable bindings', () => {
    expect(
      compile(`function a(){${row} return (Row:any)=>${list};}`).optimizedLists,
    ).toBe(0);
    expect(
      compile(
        `function a(){${row.replace('const Row', 'let Row')} return ${list};}`,
      ).optimizedLists,
    ).toBe(0);
  });
  it('does not introduce an eager TDZ read through a hoisted factory', () => {
    const result = compile(
      `const rows=[]; const before=make(); ${row} function make(){return ${list};}`,
    );
    expect(result.optimizedLists).toBe(0);
    const js = ts.transpileModule(result.code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = (id: string) =>
      id === '@craft-ts/component'
        ? {
            craftComponent: () => () => null,
            div: () => null,
            forNode: (_rows: any, _options: any, callback: any) => ({
              callback,
            }),
          }
        : {
            ɵwithCompiledTemplate: (component: any) => component,
            ɵwithCompiledItem: (factory: any) => factory,
          };
    expect(() =>
      new Function('require', 'exports', js)(require, {}),
    ).not.toThrow();
  });
  it('refuses recursion within the same initializer and earlier descriptors', () => {
    expect(compile(`${list}; ${row}`).optimizedLists).toBe(0);
    expect(
      compile(`const Row=craftComponent('Row',{},()=>div(${list}));`)
        .optimizedLists,
    ).toBe(0);
  });
  it('allows later lexical closures to capture initialized constants', () => {
    expect(
      compile(`function a(){${row} const later=()=>${list}; return later;}`)
        .optimizedLists,
    ).toBe(1);
  });
});
