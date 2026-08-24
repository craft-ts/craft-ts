import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import {
  CraftDevToolsConfig,
  defineAngularBrandConfig,
  defineCraftDevToolsConfig,
  discoverAngularBrandConfigFilePath,
} from '../angular-brand-codemod.js';

export function loadCraftDevToolsConfig(
  searchFromDir: string,
  explicitPath?: string,
): CraftDevToolsConfig {
  const filePath = explicitPath
    ? resolve(explicitPath)
    : discoverAngularBrandConfigFilePath(searchFromDir);
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
        ? { defineAngularBrandConfig, defineCraftDevToolsConfig }
        : localRequire(specifier),
    module,
    filePath,
    dirname(filePath),
  );
  const exported = module.exports['default'] ?? module.exports;
  if (!exported || typeof exported !== 'object') {
    throw new Error(`Invalid Craft dev-tools config at "${filePath}".`);
  }
  return 'brand' in exported || 'serviceMigration' in exported
    ? (exported as CraftDevToolsConfig)
    : { brand: exported };
}
