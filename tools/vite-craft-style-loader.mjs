import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Load the workspace Vite plugin before the app's TypeScript aliases exist. */
export async function loadCraftStyle() {
  const moduleUrl = pathToFileURL(
    path.resolve(import.meta.dirname, '../libs/style/src/plugin/vite.ts'),
  ).href;
  const plugin = await import(moduleUrl);
  return plugin.craftStyle;
}
