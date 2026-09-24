import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { FolderLayoutProposal } from './folder-layout.js';

export interface FolderLayoutGitPlan {
  readonly commands: string;
  readonly moves: number;
  readonly deletions: number;
  readonly manualReviews: number;
}

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const gitPath = (rootDir: string, file: string): string => {
  const absolute = resolve(rootDir, file);
  const value = relative(rootDir, absolute);
  if (!value || value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value))
    throw new Error(`craft organize apply: path is outside the Git root: ${file}`);
  return value.split(sep).join('/');
};

export function folderLayoutGitPlan(
  proposal: FolderLayoutProposal,
): FolderLayoutGitPlan {
  const moves = proposal.placements.filter(
    (placement) =>
      placement.action === 'move' &&
      placement.proposedPath !== null &&
      placement.proposedPath !== placement.sourcePath,
  );
  const deletions = proposal.placements.filter(
    (placement) => placement.action === 'delete',
  );
  const manualReviews = proposal.placements.filter(
    (placement) => placement.action === 'review',
  ).length;
  const commands = [
    ...moves.map(
      (placement) =>
        `git mv -- ${shellQuote(placement.sourcePath)} ${shellQuote(placement.proposedPath as string)}`,
    ),
    ...deletions.map(
      (placement) => `git rm -- ${shellQuote(placement.sourcePath)}`,
    ),
  ].join('\n');
  return { commands, moves: moves.length, deletions: deletions.length, manualReviews };
}

interface ImportEdit {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

function moduleSpecifierOf(node: ts.Node): ts.StringLiteralLike | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  )
    return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal;
    return ts.isStringLiteralLike(literal) ? literal : undefined;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  ) {
    const [argument] = node.arguments;
    return argument && ts.isStringLiteralLike(argument) ? argument : undefined;
  }
  return undefined;
}

function rewrittenModuleSpecifier(
  specifier: string,
  importerBefore: string,
  importerAfter: string,
  options: ts.CompilerOptions,
  movedFiles: ReadonlyMap<string, string>,
  deletedFiles: ReadonlySet<string>,
): string | undefined {
  const resolution = ts.resolveModuleName(
    specifier,
    importerBefore,
    options,
    ts.sys,
  ).resolvedModule;
  if (!resolution) return undefined;
  const targetBefore = resolve(resolution.resolvedFileName);
  if (deletedFiles.has(targetBefore))
    throw new Error(
      `craft organize apply: ${importerBefore} still imports proposed deletion ${targetBefore}.`,
    );
  const targetAfter = movedFiles.get(targetBefore);
  if (!targetAfter) return undefined;

  let relativeTarget = relative(dirname(importerAfter), targetAfter).split(sep).join('/');
  if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
  const sourceExtension = extname(specifier);
  const targetExtension = extname(targetAfter);
  if (sourceExtension) {
    relativeTarget = relativeTarget.slice(0, -targetExtension.length) + sourceExtension;
  } else if (targetExtension) {
    relativeTarget = relativeTarget.slice(0, -targetExtension.length);
  }
  return relativeTarget;
}

export function applyFolderLayoutProposal(options: {
  readonly rootDir: string;
  readonly project: string;
  readonly proposal: FolderLayoutProposal;
}): FolderLayoutGitPlan {
  const rootDir = resolve(options.rootDir);
  const plan = folderLayoutGitPlan(options.proposal);
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (resolve(gitRoot) !== rootDir)
    throw new Error('craft organize apply: run from the Git repository root.');

  const projectPath = resolve(rootDir, options.project);
  const config = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (config.error)
    throw new Error(
      `craft organize apply: cannot read ${options.project}: ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`,
    );
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(projectPath),
    undefined,
    projectPath,
  );
  if (parsed.errors.length)
    throw new Error(
      `craft organize apply: invalid TypeScript project ${options.project}.`,
    );

  const movedFiles = new Map<string, string>();
  const deletedFiles = new Set<string>();
  for (const placement of options.proposal.placements) {
    if (placement.action === 'move' && placement.proposedPath) {
      movedFiles.set(
        resolve(rootDir, placement.sourcePath),
        resolve(rootDir, placement.proposedPath),
      );
    } else if (placement.action === 'delete') {
      deletedFiles.add(resolve(rootDir, placement.sourcePath));
    }
  }

  const textUpdates = new Map<string, string>();
  for (const sourcePath of parsed.fileNames) {
    const importerBefore = resolve(sourcePath);
    if (!existsSync(importerBefore) || deletedFiles.has(importerBefore)) continue;
    const importerAfter = movedFiles.get(importerBefore) ?? importerBefore;
    const text = readFileSync(importerBefore, 'utf8');
    const source = ts.createSourceFile(
      importerBefore,
      text,
      parsed.options.target ?? ts.ScriptTarget.Latest,
      true,
      importerBefore.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const edits: ImportEdit[] = [];
    const visit = (node: ts.Node) => {
      const literal = moduleSpecifierOf(node);
      if (literal) {
        const next = rewrittenModuleSpecifier(
          literal.text,
          importerBefore,
          importerAfter,
          parsed.options,
          movedFiles,
          deletedFiles,
        );
        if (next !== undefined && next !== literal.text) {
          const start = literal.getStart(source) + 1;
          const end = literal.getEnd() - 1;
          const quote = text[literal.getStart(source)] ?? "'";
          const escaped =
            quote === '`'
              ? next
              : next.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`);
          edits.push({ start, end, value: escaped });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (edits.length) {
      let nextText = text;
      for (const edit of edits.sort((left, right) => right.start - left.start))
        nextText =
          nextText.slice(0, edit.start) + edit.value + nextText.slice(edit.end);
      textUpdates.set(importerAfter, nextText);
    }
  }

  const affected = new Set<string>();
  for (const placement of options.proposal.placements) {
    if (placement.action === 'move' || placement.action === 'delete') {
      affected.add(gitPath(rootDir, placement.sourcePath));
      if (placement.action === 'move' && placement.proposedPath)
        affected.add(gitPath(rootDir, placement.proposedPath));
    }
  }
  for (const updatedPath of textUpdates.keys())
    affected.add(gitPath(rootDir, relative(rootDir, updatedPath)));

  for (const placement of options.proposal.placements) {
    if (placement.action !== 'move' && placement.action !== 'delete') continue;
    const source = resolve(rootDir, placement.sourcePath);
    if (!existsSync(source) || !lstatSync(source).isFile())
      throw new Error(`craft organize apply: source file is missing: ${placement.sourcePath}`);
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', gitPath(rootDir, placement.sourcePath)], {
        cwd: rootDir,
        stdio: 'ignore',
      });
    } catch {
      throw new Error(`craft organize apply: source is not tracked by Git: ${placement.sourcePath}`);
    }
    if (placement.action === 'move' && placement.proposedPath) {
      const destination = resolve(rootDir, placement.proposedPath);
      if (existsSync(destination))
        throw new Error(`craft organize apply: destination already exists: ${placement.proposedPath}`);
    }
  }

  const dirty = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...affected],
    { cwd: rootDir, encoding: 'utf8' },
  ).trim();
  if (dirty)
    throw new Error(
      `craft organize apply: commit or stash existing changes in affected files before applying:\n${dirty}`,
    );

  for (const placement of options.proposal.placements) {
    if (placement.action === 'move' && placement.proposedPath) {
      const source = gitPath(rootDir, placement.sourcePath);
      const destination = gitPath(rootDir, placement.proposedPath);
      mkdirSync(dirname(resolve(rootDir, destination)), { recursive: true });
      execFileSync('git', ['mv', '--', source, destination], { cwd: rootDir });
    }
  }
  for (const placement of options.proposal.placements) {
    if (placement.action === 'delete')
      execFileSync('git', ['rm', '--', gitPath(rootDir, placement.sourcePath)], {
        cwd: rootDir,
      });
  }
  for (const [absolutePath, text] of textUpdates) {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, text, 'utf8');
  }
  if (textUpdates.size) {
    execFileSync(
      'git',
      ['add', '--', ...[...textUpdates.keys()].map((path) => gitPath(rootDir, relative(rootDir, path)))],
      { cwd: rootDir },
    );
  }
  return plan;
}
