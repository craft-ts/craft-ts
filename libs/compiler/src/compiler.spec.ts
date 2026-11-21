import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compileModule } from './compiler.js';
import { craftCompiler } from './vite.js';
const prelude = `import { craftComponent, div, span, type Input } from '@craft-ts/component';\n`;
const compile = (source: string) =>
  compileModule(prelude + source, '/app/example.ts');

describe('optional template compiler', () => {
  it('creates a static DOM factory and keeps the original template and callbacks', () => {
    const result = compile(
      `const Row = craftComponent('Row', {}, (inputs: { row: Input<string> }) => div({class: 'row'}, [span('fixed'), function* () { return yield* inputs.row(); }]));`,
    );
    expect(result.components).toEqual([
      { component: 'Row', status: 'compiled', nodes: 4, bindings: 1 },
    ]);
    expect(result.code).toContain(
      'function* () { return yield* inputs.row(); }',
    );
    expect(result.code).toContain('createElement("span")');
    expect(result.code).toContain('compiler-runtime');
    expect(result.map.sourcesContent).toEqual([
      prelude +
        `const Row = craftComponent('Row', {}, (inputs: { row: Input<string> }) => div({class: 'row'}, [span('fixed'), function* () { return yield* inputs.row(); }]));`,
    ]);
    expect(
      ts.transpileModule(result.code, { reportDiagnostics: true }).diagnostics,
    ).toEqual([]);
  });
  it('respects named overloads, omitted children and flattened array paths', () => {
    const result = compile(
      `const Row = craftComponent('Row', {}, () => div([null, [span('a'), false, span('item', {title:'tip'}, 'b')], span('c')]));`,
    );
    expect(result.components[0].status).toBe('compiled');
    expect(result.code).toContain('"slot":3,"path":[1],"name":"item"');
    expect(result.code).toContain('"slot":5,"path":[2]');
  });
  it('recognizes import aliases', () => {
    const result = compileModule(
      `import {craftComponent as component, div as box} from '@craft-ts/component'; const C=component('C',{},()=>box('ok'));`,
    );
    expect(result.components[0].status).toBe('compiled');
  });
  it.each([
    `const C=craftComponent('C',{},()=>div({click(){}}, 'x'));`,
    `const C=craftComponent('C',{},()=>div({style:'color:red'}, 'x'));`,
    `const C=craftComponent('C',{},()=>div({innerHTML:'<b>x</b>'}));`,
    `const C=craftComponent('C',{},()=>div({['title']:'x'}));`,
    `const C=craftComponent('C',{},()=>div({...props}));`,
    `const C=craftComponent('C',{},()=>div(enabled ? span('a') : null));`,
    `const C=craftComponent('C',{},()=>div(makeChildren()));`,
    `const C=craftComponent('C',{},()=>{ sideEffect(); return div('x'); });`,
    `const C=craftComponent('C',{providers:[]},()=>div('x'));`,
    `function f(div:any){return craftComponent('C',{},()=>div('x'));}`,
    `function f(){const div=custom; return craftComponent('C',{},()=>div('x'));}`,
    `const C=craftComponent('C',{},(div:any)=>div('x'));`,
    `const C=craftComponent('C',{},()=>div(()=>this.value));`,
    `const C=craftComponent('C',{},async()=>div('x'));`,
    `const C=craftComponent('C',{},<T>(inputs:Input<T>)=>div('x'));`,
    `const C=craftComponent('C',{},()=>div(async()=>1));`,
    `const C=craftComponent('C',{},()=>[div('a'),div('b')]);`,
  ])('leaves unsupported semantics intact: %s', (source) => {
    const result = compile(source);
    expect(result.components[0].status).toBe('fallback');
    expect(result.code).toBe(prelude + source);
  });
  it('keeps captured variables live without generated name collisions', () => {
    const result = compile(
      `let __craft_renderer_1=1, value=2; const C=craftComponent('C',{},()=>div(()=>value+__craft_renderer_1));`,
    );
    expect(result.components[0].status).toBe('compiled');
    expect(result.code).toContain('()=>value+__craft_renderer_1');
  });
  it('has no activation unless explicitly installed, and skips SSR and serve', () => {
    const plugin = craftCompiler();
    const apply = plugin.apply as (...args: any[]) => boolean;
    expect(apply({}, { command: 'serve' })).toBe(false);
    expect(apply({}, { command: 'build' })).toBe(true);
    expect(apply({ build: { ssr: true } }, { command: 'build' })).toBe(false);
    const transform = plugin.transform as (...args: any[]) => any;
    const source = prelude + `const C=craftComponent('C',{},()=>div('x'));`;
    expect(transform(source, '/src/c.ts', { ssr: true })).toBeNull();
    expect(transform(source, '/node_modules/c.ts')).toBeNull();
    expect(transform(source, '/src/c.ts?raw')).toBeNull();
    expect(transform(source, '/src/c.ts').code).toContain('compiler-runtime');
  });
});

describe('proven component list factories', () => {
  const source = `import {craftComponent, div, forNode} from '@craft-ts/component';
    const Row=craftComponent('Row',{},(inputs:any)=>div(function*(){return (yield* inputs.row()).name;}));
    const App=craftComponent('App',{},()=>div(forNode(rows,{track:r=>r.id},(row,index)=>Row({row,position:index}))));`;
  it('specializes a module constant and a callback that only forwards inputs', () => {
    const result = compileModule(source);
    expect(result.optimizedLists).toBe(1);
    expect(result.code).toContain('ɵwithCompiledItem');
    expect(
      compileModule(source, 'app.ts', { lists: false }).optimizedLists,
    ).toBe(0);
  });
  it.each([
    [
      '(row,index)=>Row({row,position:index})',
      '(row,index)=>Row({row,position:readIndex(index)})',
    ],
    [
      '(row,index)=>Row({row,position:index})',
      '(row,index)=>Row({row,...props})',
    ],
    ['const Row=', 'let Row='],
    ['()=>div(forNode', '(Row:any)=>div(forNode'],
  ])('does not invent purity or ignore shadowing: %s', (before, after) => {
    expect(compileModule(source.replace(before, after)).optimizedLists).toBe(0);
  });
});

describe('lexical binding and repeat transforms', () => {
  it.each([
    `function f(){ if (false) {var div=custom;} return craftComponent('C',{},()=>div('x')); }`,
    `try {work();} catch(div) {craftComponent('C',{},()=>div('x'));}`,
    `for(let div of helpers) {craftComponent('C',{},()=>div('x'));}`,
    `const C=craftComponent('C',{},function div(){return div('x');});`,
    `const C=craftComponent('C',{},()=>div({title:()=>1,title:'final'}));`,
  ])('falls back for shadowing or ambiguous duplicate props: %s', (source) => {
    expect(compile(source).components[0].status).toBe('fallback');
  });
  it('is idempotent and preserves directive prologues', () => {
    const source = `'use client';\n${prelude}const C=craftComponent('C',{},()=>div('x'));`;
    const first = compileModule(source);
    expect(first.code.startsWith("'use client';")).toBe(true);
    expect(compileModule(first.code).code).toBe(first.code);
  });
});
