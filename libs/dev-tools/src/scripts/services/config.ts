import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { defineCraftDevToolsConfig, type CraftDevToolsConfig } from './config-types.js';

function discoverCraftDevToolsConfigFilePath(
  searchFromDir: string,
): string | undefined {
  let currentDir = resolve(searchFromDir);
  while (true) {
    const candidate = join(currentDir, 'craft-dev-tools.config.ts');
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    const parent = dirname(currentDir);
    if (parent === currentDir) return undefined;
    currentDir = parent;
  }
}

export function loadCraftDevToolsConfig(
  searchFromDir: string,
  explicitPath?: string,
): CraftDevToolsConfig {
  const filePath = explicitPath
    ? resolve(explicitPath)
    : discoverCraftDevToolsConfigFilePath(searchFromDir);
  if (!filePath) return {};
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Craft dev-tools config file not found at "${filePath}".`);
  }

  const sourceText = readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const localRequire = createRequire(filePath);
  const execute = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    output,
  ) as (...args: unknown[]) => void;
  execute(
    module.exports,
    (specifier: string) =>
      specifier === '@craft-ts/dev-tools'
        ? { defineCraftDevToolsConfig }
        : localRequire(specifier),
    module,
    filePath,
    dirname(filePath),
  );
  const exported = module.exports['default'] ?? module.exports;
  if (!exported || typeof exported !== 'object') {
    throw new Error(`Invalid Craft dev-tools config at "${filePath}".`);
  }
  return exported as CraftDevToolsConfig;
}
