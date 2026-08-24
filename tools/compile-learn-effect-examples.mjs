import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const workspaceRoot = resolve(import.meta.dirname, '..');
const docsRoot = join(workspaceRoot, 'apps/docs');
const learnEffectRoot = join(docsRoot, 'learn-effect');
const fencePattern = /^```(typescript|ts|tsx)(?:[ \t]+.*)?$/gm;

const markdownFiles = readdirSync(learnEffectRoot)
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map((file) => join(learnEffectRoot, file));

const examples = markdownFiles.flatMap((filePath) =>
  extractExamples(filePath, readFileSync(filePath, 'utf8')),
);

const diagnostics = examples.flatMap(({ filePath, startLine, language, code }) => {
  const source = wrapContextualExample(code, language);
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    isolatedModules: true,
    strict: true,
  };
  if (language === 'tsx') {
    compilerOptions.jsx = ts.JsxEmit.Preserve;
  }
  const result = ts.transpileModule(source, {
    fileName: `${relative(workspaceRoot, filePath)}.${language}`,
    compilerOptions,
    reportDiagnostics: true,
  });

  return (result.diagnostics ?? []).map((diagnostic) => ({
    filePath,
    startLine,
    message: ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    ),
  }));
});

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    process.stderr.write(
      `${relative(workspaceRoot, diagnostic.filePath)}:${diagnostic.startLine}: ${diagnostic.message}\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Compiled ${examples.length} learn-effect TypeScript/TSX examples.\n`,
  );
}

function extractExamples(filePath, markdown) {
  const result = [];
  let match;

  fencePattern.lastIndex = 0;
  while ((match = fencePattern.exec(markdown)) !== null) {
    const openingLine = markdown.slice(0, match.index).split('\n').length;
    const contentStart = match.index + match[0].length;
    const closingOffset = markdown.indexOf('\n```', contentStart);
    if (closingOffset < 0) {
      result.push({
        filePath,
        startLine: openingLine,
        language: match[1],
        code: markdown.slice(contentStart),
      });
      break;
    }

    result.push({
      filePath,
      startLine: openingLine + 1,
      language: match[1],
      code: markdown.slice(contentStart, closingOffset),
    });
    fencePattern.lastIndex = closingOffset + '\n```'.length;
  }
  return result;
}

function wrapContextualExample(code, language) {
  const sourceFile = ts.createSourceFile(
    'learn-effect-example.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
    // TSX parsing is a superset for these excerpts and tolerates the JSX-like
    // syntax that some Craft examples may introduce later.
    ts.ScriptKind.TSX,
  );
  const imports = [];
  const removals = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      imports.push(statement.getText(sourceFile));
      removals.push([statement.getStart(sourceFile), statement.getEnd()]);
    }
  }

  let body = code;
  for (const [start, end] of removals.reverse()) {
    body = `${body.slice(0, start)}${body.slice(end)}`;
  }

  // Documentation snippets often show declarations as if they were copied
  // into an existing Craft generator. Remove only declaration-level `export`
  // keywords before placing the excerpt in that generator context.
  body = body.replace(/(^|\n)(\s*)export\s+(?=(?:declare\s+)?(?:const|function|class|type|interface)\b)/g, '$1$2');

  return [
    ...imports,
    'function* __learnEffectExample() {',
    body,
    '}',
  ].join('\n');
}
