import { prepareCandidate, replaceOnce, lab } from './prepare.mjs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = join(lab, 'roots/effectless');
try {
  await access(join(root, 'candidate.json'));
} catch {
  await prepareCandidate('effectless', [
    {
      file: 'libs/core/src/lib/yieldable.ts',
      change: (source) =>
        replaceOnce(
          source,
          `/** {@link ɵsettledReader} of a value that does not change. */`,
          `const settledScalars = new WeakMap<Function, unknown>();
export const ɵSCALAR_UNPROVEN = Symbol('Craft.scalarUnproven');
/** Exact framework-created constant readers only; never calls application code. */
export function ɵreadSettledScalar(reader: unknown): unknown {
  if (typeof reader !== 'function') return ɵSCALAR_UNPROVEN;
  const value = settledScalars.get(reader);
  return value === undefined && !settledScalars.has(reader) ? ɵSCALAR_UNPROVEN : value;
}
/** {@link ɵsettledReader} of a value that does not change. */`,
        ).replace(
          `  const reader = () => new SettledInvocation(value);
  return tagAsGeneratorFunction(reader);`,
          `  const reader = () => new SettledInvocation(value);
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) settledScalars.set(reader, value);
  return tagAsGeneratorFunction(reader);`,
        ),
    },
    {
      file: 'libs/compiler/src/compiler.ts',
      change: (source) => {
        source = replaceOnce(
          source,
          '      input?: string;',
          '      input?: string;\n      scalarInput?: string;',
        );
        source = replaceOnce(
          source,
          `      if (
        options.lean &&
        key !== undefined &&`,
          `      let scalarInput = indirect ? (n as ts.PropertyAccessExpression).name.text : undefined;
      if (options.lean && options.lower !== false && ts.isFunctionExpression(n) && n.asteriskToken && n.parameters.length === 0 && n.body.statements.length === 1) {
        const statement = n.body.statements[0];
        const expression = ts.isReturnStatement(statement) && statement.expression;
        const call = expression && ts.isYieldExpression(expression) && expression.asteriskToken && expression.expression;
        if (call && ts.isCallExpression(call) && call.arguments.length === 0 && ts.isPropertyAccessExpression(call.expression) && ts.isIdentifier(call.expression.expression) && call.expression.expression.text === input)
          scalarInput = call.expression.name.text;
      }
      if (
        options.lean &&
        key !== undefined &&`,
        );
        source = replaceOnce(
          source,
          '        bindings.push({ slot, path, key });',
          '        bindings.push({ slot, path, key, ...(scalarInput ? {scalarInput} : {}) });',
        );
        source = replaceOnce(
          source,
          '        ...(plain !== undefined ? { lowered: true } : {}),',
          '        ...(plain !== undefined ? { lowered: true } : {}),\n        ...(scalarInput ? {scalarInput} : {}),',
        );
        return source;
      },
    },
    {
      file: 'libs/component/src/lib/render/compiled-template.ts',
      change: (source) =>
        replaceOnce(
          source,
          '    readonly input?: string;',
          '    readonly input?: string;\n    readonly scalarInput?: string;',
        ),
    },
    {
      file: 'libs/component/src/lib/render/interpreter.ts',
      change: (source) => {
        source = replaceOnce(
          source,
          '  ɵsettledValueReader,',
          '  ɵsettledValueReader,\n  ɵreadSettledScalar,\n  ɵSCALAR_UNPROVEN,',
        );
        const start = source.indexOf('class LeanComponentRenderedNode');
        let tail = source.slice(start);
        tail = replaceOnce(
          tail,
          '          const stop = ɵcraftBindingEffect(() => {',
          `          const scalar = binding.scalarInput === undefined ? ɵSCALAR_UNPROVEN : ɵreadSettledScalar(inputs[binding.scalarInput]);
          const apply = () => {`,
        );
        tail = replaceOnce(
          tail,
          `            if (binding.lowered) {`,
          `            if (scalar !== ɵSCALAR_UNPROVEN) value = scalar;
            else if (binding.lowered) {`,
        );
        tail = replaceOnce(
          tail,
          `          });
          if (stop) stops.push(stop);`,
          `          };
          const stop = scalar === ɵSCALAR_UNPROVEN ? ɵcraftBindingEffect(apply) : (apply(), undefined);
          if (stop) stops.push(stop);`,
        );
        return source.slice(0, start) + tail;
      },
    },
  ]);
}
await writeFile(
  join(root, 'libs/core/src/lib/performance-scalar.spec.ts'),
  await readFile(new URL('./effectless.contracts.ts', import.meta.url)),
);
await writeFile(
  join(root, 'libs/compiler/src/performance-scalar.spec.ts'),
  `import {it,expect} from 'vitest';
import {compileModule} from './compiler';
const header="import {craftComponent,div} from '@craft-ts/component';";
it('annotates only direct inputs and a single delegated return',()=>{
 const c=(expr)=>compileModule(header+"const C=craftComponent('C',{},inputs=>div("+expr+"));",'a.ts',{lean:true}).code;
 expect(c('inputs.label')).toContain('"scalarInput":"label"');
 expect(c('function*(){return yield* inputs.label();}')).toContain('"scalarInput":"label"');
 expect(c('function*(){return (yield* inputs.row()).label;}')).not.toContain('scalarInput');
 expect(c('function*(){try{return yield* inputs.label();}finally{cleanup();}}')).not.toContain('scalarInput');
});\n`,
);
console.log(root);
