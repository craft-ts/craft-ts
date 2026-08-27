import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const effectTsgoPath = resolve(workspaceRoot, 'node_modules/.bin/effect-tsgo');

// The native package currently published for macOS can lose its executable
// bit when npm installs it. Repair it just before spawning the official CLI.
if (process.platform !== 'win32') {
  const platformPackage = `@effect/tsgo-${process.platform}-${process.arch}`;
  const nativeBinary = resolve(
    workspaceRoot,
    'node_modules',
    platformPackage,
    'lib',
    'tsc',
  );
  if (existsSync(nativeBinary)) chmodSync(nativeBinary, 0o755);
}

const originalArgs = process.argv.slice(2);
const projectArgument =
  valueAfter(originalArgs, '--project') ?? valueAfter(originalArgs, '-p');

if (originalArgs[0] === 'diagnostics' && projectArgument) {
  const projectPath = resolve(workspaceRoot, projectArgument);
  const report = inspectDiagnosticScope(projectPath);
  console.log(`Effect check scope: ${relative(workspaceRoot, projectPath)}`);
  console.log(`Source candidates: ${report.candidates.length}`);
  console.log(`TypeScript program files: ${report.programFiles.length}`);
  if (report.excluded.length > 0) {
    console.log('Excluded source candidates:');
    for (const item of report.excluded)
      console.log(`  - ${item.file}: ${item.reason}`);
  }
  if (report.programFiles.length === 0) {
    console.error(
      'Effect check refused to continue: the project contains no files in the TypeScript program. Check include/exclude and the --project path.',
    );
    process.exitCode = 1;
    process.exit();
  }
}

const args =
  originalArgs[0] === 'diagnostics' && !originalArgs.includes('--progress')
    ? [...originalArgs, '--progress']
    : originalArgs;
const result = spawnSync(effectTsgoPath, args, {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}

function inspectDiagnosticScope(projectPath) {
  const projectRoot = resolve(projectPath, '..');
  const candidates = listTypeScriptFiles(projectRoot);
  const listResult = spawnSync(
    resolve(workspaceRoot, 'node_modules/.bin/tsc'),
    ['-p', projectPath, '--listFilesOnly', '--pretty', 'false'],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  const programFiles = (listResult.stdout ?? '')
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => /\.(?:ts|tsx|mts|cts)$/.test(file))
    .map((file) => resolve(workspaceRoot, file));
  const programSet = new Set(programFiles);
  const excluded = candidates
    .filter((file) => !programSet.has(file))
    .map((file) => ({
      file: relative(workspaceRoot, file),
      reason: exclusionReason(file, projectRoot),
    }));
  return { candidates, programFiles, excluded };
}

function listTypeScriptFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'out-tsc'
    )
      continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...listTypeScriptFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

function exclusionReason(file, projectRoot) {
  const relativeFile = relative(projectRoot, file).replaceAll('\\', '/');
  if (/\.(?:spec|test)\.(?:ts|tsx|mts|cts)$/.test(relativeFile)) {
    return 'not part of the diagnostics source set (test file; check the tsconfig exclude/include rules)';
  }
  if (relativeFile.startsWith('../')) {
    return 'outside the project root; it is only available if imported by the project program';
  }
  return 'not matched by the project include patterns or matched by an exclude pattern';
}
