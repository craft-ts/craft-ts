// PROTOTYPE: these transforms run exclusively in diagnose.mjs's temporary runtime.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const here = dirname(fileURLToPath(import.meta.url));
export async function applyMountNextPrototype(name, { paths, patch, scratch }) {
  const read = (p) => readFile(join(scratch, p), 'utf8');
  const write = (p, s) => writeFile(join(scratch, p), s);
  const append = async (p, s) => write(p, (await read(p)) + '\n' + s);
  if (name === 'signals') {
    await append(
      paths.render,
      `
// Private renderer cell: same equality and boxing, without public signal branding.
import { signal as prototypeRawSignal } from 'alien-signals';
function prototypeRendererSignal<T>(initial: T): any {
  const raw = prototypeRawSignal({value: initial});
  const read = () => raw().value;
  read.set = (next: T) => { if (!Object.is(untracked(read), next)) raw({value: next}); };
  read.update = (fn: (value: T) => T) => read.set(fn(untracked(read)));
  return read;
}
`,
    );
    await patch(
      paths.render,
      'const indexSignal = signal(index);',
      'const indexSignal = prototypeRendererSignal(index);',
    );
    await patch(
      paths.render,
      'signal((props as Record<string, unknown>)[key]),',
      'prototypeRendererSignal((props as Record<string, unknown>)[key]),',
    );
    await patch(
      paths.render,
      'this.hostPropsSource = signal(',
      'this.hostPropsSource = prototypeRendererSignal(',
    );
    const render = await read(paths.render);
    if (render.includes('this.source = signal(node.props)'))
      await write(
        paths.render,
        render.replace(
          'this.source = signal(node.props)',
          'this.source = prototypeRendererSignal(node.props)',
        ),
      );
  } else if (name === 'effects') {
    const source = await read(paths.effect);
    const ast = ts.createSourceFile(
      paths.effect,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const fn = ast.statements.find(
      (n) =>
        ts.isFunctionDeclaration(n) && n.name?.text === 'craftEffect' && n.body,
    );
    assert(fn);
    const body = fn.body
      .getText(ast)
      .replace(
        'return createNamedPrimitiveGen(name, ref, { markMembers: false });',
        'return ref;',
      );
    assert(!body.includes('return createNamedPrimitiveGen'));
    const impl = `export function craftEffect(name: string, hostOrFn: unknown, fnOrOptions?: unknown, maybeOptions?: CreateEffectOptions): NamedCraftPrimitiveGen<string, EffectRef> {
  return createNamedPrimitiveGen(name, prototypeCreateEffectRef(name, hostOrFn, fnOrOptions, maybeOptions), {markMembers: false});
}
/** @internal Experimental direct effect entry; public generator API remains intact. */
export function prototypeCreateEffectRef(name: string, hostOrFn: unknown, fnOrOptions?: unknown, maybeOptions?: CreateEffectOptions): EffectRef ${body}`;
    await write(
      paths.effect,
      source.slice(0, fn.getStart(ast)) + impl + source.slice(fn.end),
    );
    let render = await read(paths.render);
    render = render
      .replace('  craftEffect,', '  prototypeCreateEffectRef,')
      .replaceAll('craftEffect(', 'prototypeCreateEffectRef(');
    const tree = ts.createSourceFile(
        paths.render,
        render,
        ts.ScriptTarget.Latest,
        true,
      ),
      edits = [];
    function walk(n) {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(tree) === 'craftUse' &&
        n.arguments.length === 1
      ) {
        const arg = n.arguments[0];
        if (
          ts.isCallExpression(arg) &&
          arg.expression.getText(tree) === 'prototypeCreateEffectRef'
        ) {
          edits.push([n.getStart(tree), n.end, arg.getText(tree)]);
          return;
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(tree);
    assert(edits.length >= 4);
    for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0]))
      render = render.slice(0, start) + text + render.slice(end);
    await write(paths.render, render);
  } else if (name === 'identity') {
    // Prefix hydration encoding is applied by the caller, before this transform.
    await append(
      paths.identity,
      await readFile(
        join(here, 'prototype-runtime/prefix-fingerprint.ts.txt'),
        'utf8',
      ),
    );
    await patch(
      paths.identity,
      '  DIAG_TRUSTED_IDENTITIES.add(identity);\n  return identity;',
      '  DIAG_TRUSTED_IDENTITIES.add(identity);\n  prototypePathPrefixes.set(identity.path, {tail: normalized});\n  return identity;',
    );
    await patch(
      paths.identity,
      '  DIAG_TRUSTED_IDENTITIES.add(identity);\n  return identity;',
      '  DIAG_TRUSTED_IDENTITIES.add(identity);\n  prototypePathPrefixes.set(identity.path, {parent: parent.path, tail});\n  return identity;',
    );
    await patch(
      paths.replay,
      '/** Opaque address',
      "import { prototypeFingerprintPath } from './craft-render-identity';\n\n/** Opaque address",
    );
    await patch(
      paths.replay,
      '  const pathKey = JSON.stringify(craftPath);\n  const targetId = stableFingerprint(pathKey);',
      '  const targetId = prototypeFingerprintPath(craftPath);',
    );
    await patch(
      paths.render,
      'interface ForRenderedEntry {',
      'interface ForRenderedEntry {\n  readonly identity: CraftRenderIdentity;',
    );
    await patch(
      paths.render,
      '        entry = {\n          key,',
      '        entry = {\n          identity: entryContext.identity,\n          key,',
    );
    await patch(
      paths.render,
      '            entry.key,\n',
      '            entry.key,\n            entry.identity,\n',
    );
    await patch(
      paths.render,
      '    key: unknown,\n  ): CraftNodeChildren {',
      '    key: unknown,\n    identity: CraftRenderIdentity,\n  ): CraftNodeChildren {',
    );
    await patch(
      paths.render,
      '        identity: childCraftRenderIdentity(\n          this.context.identity,\n          `item:${String(key)}`,\n        ),',
      '        identity,',
    );
  } else if (name === 'component') {
    await append(
      paths.coarse,
      '\nObject.defineProperty(RowByComponentPrototype, "__prototypePlannedComponent", {value: {indexes: settings.indexes}});\n',
    );
    await append(
      paths.render,
      await readFile(
        join(here, 'prototype-runtime/planned-component.ts.txt'),
        'utf8',
      ),
    );
    await patch(
      paths.render,
      "    case 'component':\n      return new ComponentRenderedNode(",
      "    case 'component':\n      if (prototypeCanPlanComponent(node, context, parent)) return new PrototypePlannedComponent(node, parent, before, context);\n      return new ComponentRenderedNode(",
    );
  } else throw new Error(`Unknown next prototype ${name}`);
}
