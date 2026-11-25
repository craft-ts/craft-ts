const { existsSync } = require('node:fs');
const { basename, dirname, resolve } = require('node:path');

// `@craft-ts/component/style` carries only tokens declared in the framework's
// own sheets (the AI launcher's position), so it is safe to evaluate in Node.
// `@craft-ts/ui/style` is the same kind of entry for the design system: the theme
// and the sheets, no component.
const ALLOWED_MODULES = [
  '@craft-ts/style',
  '@craft-ts/component/style',
  '@craft-ts/ui/style',
];

/** The JavaScript output extensions, and the typed files TypeScript reads for them. */
const TYPED_SUBSTITUTES = {
  '.js': ['.ts', '.tsx', '.d.ts'],
  '.jsx': ['.tsx', '.ts', '.d.ts'],
  '.mjs': ['.mts', '.d.mts'],
  '.cjs': ['.cts', '.d.cts'],
};

const JS_EXTENSION = /\.(?:[cm]?js|jsx)$/;

/** A file TypeScript types from source or declarations: `x.style.ts`, `x.style.d.mts`… */
const typedStyleFile = (stem) =>
  new RegExp(`${escapeRegExp(stem)}(?:\\.d)?\\.[cm]?tsx?$`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The file the program resolved `literal` to, as TypeScript sees it:
 * `{ file }`, `{ file: undefined }` when it resolved to nothing, or `undefined`
 * when no typed program is available for this file.
 */
function resolvedByProgram(sourceCode, literal) {
  const services = sourceCode.parserServices;
  const program = services?.program;
  const toTs = services?.esTreeNodeToTSNodeMap;
  if (!program || !toTs?.has(literal)) return undefined;
  try {
    const checker = program.getTypeChecker();
    const symbol = checker.getSymbolAtLocation(toTs.get(literal));
    const declaration =
      symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? undefined;
    const file = declaration?.getSourceFile?.().fileName;
    return { file };
  } catch {
    return undefined;
  }
}

/** The typed sibling TypeScript would substitute for `specifier`, on disk. */
function resolvedOnDisk(filename, specifier) {
  const extension = specifier.match(JS_EXTENSION)?.[0];
  const base = resolve(
    dirname(filename),
    specifier.slice(0, -extension.length),
  );
  for (const substitute of TYPED_SUBSTITUTES[extension]) {
    if (existsSync(base + substitute)) return { file: base + substitute };
  }
  return existsSync(base + extension)
    ? { file: base + extension }
    : { file: undefined };
}

/**
 * A `*.style.ts` may import style vocabulary and nothing else.
 *
 * This is not a taste rule: the build plugin **imports these modules in Node**
 * to read the values they register. An application import would drag component
 * code, DI, or browser globals into that evaluation, and the emitter would
 * either crash or — worse — succeed while running application side effects at
 * build time.
 *
 * Relative imports are allowed only between style files, so a design system can
 * be split across several of them.
 *
 * A specifier spelled with its JavaScript output extension — `./tokens.style.js`,
 * which `"moduleResolution": "NodeNext"` requires — is accepted only when it
 * reaches a **typed** style module: a `*.style.ts` source or a `*.style.d.ts`
 * declaration. The suffix alone proves nothing: a plain `tokens.style.js`
 * would hand the sheet untyped values, and the tokens it imports would lose
 * their CraftTS types. With a typed program the rule asks TypeScript which file
 * the import resolved to; without one it applies the extension substitution
 * TypeScript performs (`.js` → `.ts`/`.tsx`/`.d.ts`, `.mjs` → `.mts`/`.d.mts`,
 * `.cjs` → `.cts`/`.d.cts`) beside the importing file.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Restrict *.style.ts files to style vocabulary imports so the build plugin can evaluate them in Node.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          suffix: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      applicationImport:
        "A style file may only import style vocabulary, and '{{source}}' is not. The build plugin imports this file in Node to read the values it registers; an application import would run application code at build time. Move what you need into the sheet, or into another *.style.ts.",
      untypedStyleImport:
        "'{{source}}' names a style module by its JavaScript output, but {{target}}. A style file may import another style module only when TypeScript reads its typed source or declarations, so the tokens it exports keep their CraftTS token types. Add '{{typedSource}}' (or its '{{declaration}}' declaration) beside it.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const allowed = new Set([...ALLOWED_MODULES, ...(options.allow ?? [])]);
    const suffix = options.suffix ?? '.style.ts';
    const filename = context.filename ?? context.getFilename();

    if (!filename.endsWith(suffix)) return {};

    // `.style.ts` → `.style`: the part every spelling of a style specifier shares.
    const stem = suffix.replace(/\.[cm]?tsx?$/, '');
    const typedTarget = typedStyleFile(stem);
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    const check = (node, literal) => {
      const source = literal?.value;
      if (typeof source !== 'string') return;
      if (allowed.has(source)) return;
      if (source.startsWith('.')) {
        // A relative import is fine as long as it lands on another style file:
        // splitting a design system across files must stay possible. Spelled
        // without an extension or with the source one (`./tokens.style.ts`),
        // the specifier names the typed source itself.
        if (
          source.endsWith('.style') ||
          source.endsWith(stem) ||
          source.endsWith(suffix)
        ) {
          return;
        }
        // Spelled with the JavaScript output extension, as NodeNext requires:
        // accepted only once the target is proven to be typed.
        const extension = source.match(JS_EXTENSION)?.[0];
        if (extension && source.slice(0, -extension.length).endsWith(stem)) {
          const byProgram = resolvedByProgram(sourceCode, literal);
          const { file } = byProgram ?? resolvedOnDisk(filename, source);
          if (file && typedTarget.test(file)) return;
          // With a program, TypeScript's answer is the proof: the disk is
          // read only to say what the import reaches instead.
          const reached =
            file ??
            (byProgram ? resolvedOnDisk(filename, source).file : undefined);
          const expected = basename(source.slice(0, -extension.length));
          const substitutes = TYPED_SUBSTITUTES[extension];
          context.report({
            node,
            messageId: 'untypedStyleImport',
            data: {
              source,
              typedSource: expected + substitutes[0],
              declaration: expected + substitutes[substitutes.length - 1],
              target: !reached
                ? 'it resolves to no file'
                : JS_EXTENSION.test(reached)
                  ? `it resolves to '${basename(reached)}', a plain JavaScript file with no type declarations`
                  : `it resolves to '${basename(reached)}', which is not a typed *${stem} module`,
            },
          });
          return;
        }
      }
      context.report({
        node,
        messageId: 'applicationImport',
        data: { source },
      });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source);
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source);
      },
    };
  },
};
